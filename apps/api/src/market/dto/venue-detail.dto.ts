export interface MenuItemDto {
  id: string;
  name: string;
  price: number;
  currency: string;
  description: string | null;
}

export interface MenuSectionDto {
  title: string;
  items: MenuItemDto[];
}

export interface MenuSummaryDto {
  sections: MenuSectionDto[];
}

export interface VenueWidgetDto {
  tenantId: string;
  bookingUrl: string;
}

export interface ReviewDto {
  id: string;
  guestName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  response: string | null;
  respondedAt: string | null;
}

export interface VenueDetailDto {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  timezone: string;
  cuisines: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  heroImageUrl: string | null;
  gallery: string[];
  priceLevel: number | null;
  rating: number | null;
  reviewCount: number;
  tags: string[];
  description: string | null;
  hours: any;
  amenities: string[];
  dressCode: string | null;
  parkingInfo: string | null;
  publicTransit: string | null;
  menuSummary: MenuSummaryDto;
  widget: VenueWidgetDto;
  reviews: ReviewDto[];
  nextAvailableSlots: string[]; // Array of ISO datetimes
}
