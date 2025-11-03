Param()

$BaseUrl = $env:API_BASE_URL
if (-not $BaseUrl -or $BaseUrl.Trim().Length -eq 0) {
  $BaseUrl = 'http://localhost:3000'
}

$ApiKey = $env:API_KEY
if (-not $ApiKey -or $ApiKey.Trim().Length -eq 0) {
  throw 'API_KEY environment variable is required for admin endpoints.'
}

$VenueId = $env:VENUE_ID
if (-not $VenueId -or $VenueId.Trim().Length -eq 0) {
  $VenueId = 'venue-main'
}

$PartySize = $env:PARTY_SIZE
if (-not $PartySize -or -not [int]::TryParse($PartySize, [ref]([int]$null))) {
  $PartySize = 2
} else {
  $PartySize = [int]$PartySize
}

$ServiceDate = $env:DATE
if (-not $ServiceDate -or $ServiceDate.Trim().Length -eq 0) {
  $ServiceDate = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')
}

$VenueTimezone = $env:VENUE_TZ
if (-not $VenueTimezone -or $VenueTimezone.Trim().Length -eq 0) {
  $VenueTimezone = 'Europe/Tirane'
}

Write-Host "== Availability Policy Smoke Test =="
Write-Host "Base URL:        $BaseUrl"
Write-Host "Venue:           $VenueId"
Write-Host "Target date:     $ServiceDate"
Write-Host "Party size:      $PartySize"
Write-Host "Venue timezone:  $VenueTimezone"
Write-Host ''

function Invoke-Api {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [object]$Body
  )

  $uri = "$BaseUrl$Path"
  $headers = @{
    'x-api-key'    = $ApiKey
    'Accept'       = 'application/json'
  }

  $invokeParams = @{
    Method  = $Method
    Uri     = $uri
    Headers = $headers
    ErrorAction = 'Stop'
  }

  if ($Body) {
    $headers['Content-Type'] = 'application/json'
    $invokeParams['Body'] = ($Body | ConvertTo-Json -Depth 10)
  }

  Write-Host "[$Method] $uri"
  if ($Body) {
    Write-Host ($invokeParams['Body'])
  }

  try {
    return Invoke-RestMethod @invokeParams
  } catch {
    throw "Request failed: $($_.Exception.Message)"
  }
}

function Get-Availability {
  param(
    [Parameter(Mandatory)][string]$Time
  )
  $query = "/v1/availability?venueId=$($VenueId)&date=$($ServiceDate)&time=$Time&partySize=$PartySize"
  return Invoke-Api -Method GET -Path $query
}

function Pick-FirstSlot {
  param(
    [Parameter(Mandatory)][object]$Availability
  )
  $slot = $Availability.policySlots |
    Where-Object { $_.remaining -gt 0 } |
    Sort-Object startUtc |
    Select-Object -First 1

  if (-not $slot) {
    throw 'No available slot with remaining capacity.'
  }

  $utcStart = [DateTime]::Parse($slot.startUtc).ToUniversalTime()
  $tzInfo = [TimeZoneInfo]::FindSystemTimeZoneById($VenueTimezone)
  $localStart = [TimeZoneInfo]::ConvertTimeFromUtc($utcStart, $tzInfo)

  return @{
    Slot = $slot
    LocalTime = $localStart.ToString('HH:mm')
  }
}

# 1) List shifts
Write-Host "Step 1: Listing shifts"
$shiftResponse = Invoke-Api -Method GET -Path "/v1/admin/shifts?venueId=$($VenueId)"
$shifts = $shiftResponse.items
if (-not $shifts -or $shifts.Count -eq 0) {
  throw "No shifts configured for venue '$VenueId'."
}
$primaryShift = $shifts | Sort-Object dow, startsAt | Select-Object -First 1
$primaryStart = if ($primaryShift) { $primaryShift.startsAt } else { '18:00' }
Write-Host "Found $($shifts.Count) shifts. Using primary start time $primaryStart for availability checks."
Write-Host ''

# 2) Create blackout for target date
Write-Host "Step 2: Creating blackout for $ServiceDate"
$blackoutPayload = @{
  venueId = $VenueId
  date    = $ServiceDate
  reason  = 'Availability smoke test'
}
$blackoutResult = Invoke-Api -Method POST -Path '/v1/admin/blackouts' -Body $blackoutPayload
$blackoutId = $blackoutResult.blackout.id
Write-Host "Created blackout $blackoutId"
Write-Host ''

# 3) Fetch availability (should be zero)
Write-Host "Step 3: Availability during blackout"
$availabilityBlocked = Get-Availability -Time $primaryStart
$zeroSlots = $availabilityBlocked.policySlots | ForEach-Object { $_.remaining } | Measure-Object -Sum
Write-Host ("Policy slots: {0} (remaining sum {1})" -f ($availabilityBlocked.policySlots.Count), $zeroSlots.Sum)
Write-Host ''

# 4) Delete blackout
Write-Host "Step 4: Removing blackout $blackoutId"
Invoke-Api -Method DELETE -Path "/v1/admin/blackouts/$blackoutId" | Out-Null
Write-Host "Blackout removed."
Write-Host ''

# 5) Availability again (slots expected)
Write-Host "Step 5: Availability after blackout removal"
$availabilityOpen = Get-Availability -Time $primaryStart
Write-Host ("Policy slots available: {0}" -f $availabilityOpen.policySlots.Count)
$chosen = Pick-FirstSlot -Availability $availabilityOpen
$initialRemaining = $chosen.Slot.remaining
Write-Host ("Selected slot {0} (remaining {1})" -f $chosen.Slot.startUtc, $initialRemaining)
Write-Host ''

# 6) Create reservation then re-query
Write-Host "Step 6: Creating reservation and verifying cache invalidation"
$reservationPayload = @{
  venueId   = $VenueId
  date      = $ServiceDate
  time      = $chosen.LocalTime
  partySize = $PartySize
  channel   = 'smoke-script'
  createdBy = 'availability-smoke'
  guest     = @{
    name = 'Smoke Tester'
  }
}
$reservationResult = Invoke-Api -Method POST -Path '/v1/reservations' -Body $reservationPayload
$reservationId = $reservationResult.id
Write-Host "Created reservation $reservationId for $($reservationPayload.time)"

$availabilityAfter = Get-Availability -Time $primaryStart
$updatedSlot = $availabilityAfter.policySlots |
  Where-Object { $_.startUtc -eq $chosen.Slot.startUtc } |
  Select-Object -First 1

if (-not $updatedSlot) {
  throw 'Updated slot not found after reservation creation.'
}

Write-Host ("Slot remaining changed from {0} -> {1}" -f $initialRemaining, $updatedSlot.remaining)
if ($updatedSlot.remaining -ge $initialRemaining) {
  throw 'Expected remaining capacity to decrease after reservation creation.'
}
Write-Host ''
Write-Host 'Smoke test completed successfully.'
