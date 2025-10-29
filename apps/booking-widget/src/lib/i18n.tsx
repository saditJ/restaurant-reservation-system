'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'en' | 'al';

type Values = Record<string, string | number>;

const translations = {
  en: {
    'app.title': 'Reserve a table',
    'app.description': 'Finish your booking in three easy steps.',
    'app.health.ok': 'API: ok',
    'app.health.error': 'API: offline',
    'app.health.checking': 'API: checking...',
    'app.locale.toggle': 'Language',
    'app.locale.en': 'English',
    'app.locale.al': 'Shqip',

    'wizard.stepOf': 'Step {current} of {total}',
    'wizard.step.plan': 'Plan your visit',
    'wizard.step.details': 'Guest details',
    'wizard.step.review': 'Review & confirm',
    'wizard.next': 'Continue',
    'wizard.back': 'Back',
    'wizard.retry': 'Retry',

    'plan.party': 'Party size',
    'plan.date': 'Date',
    'plan.time': 'Time',
    'plan.preference': 'Table preference',
    'plan.preference.none': 'No preference (auto-assign)',
    'plan.preference.warning':
      'Selected table seats {capacity}, but party is {party}.',
    'plan.submit': 'Check availability',
    'plan.loading': 'Checking availability...',
    'plan.error': 'We could not reach the reservation system. Try again.',
    'plan.empty': 'No tables available. Adjust your time or party size.',
    'plan.conflicts.title': 'Conflicts detected',
    'plan.conflicts.reservations': 'Existing reservations',
    'plan.conflicts.holds': 'Active holds',
    'plan.conflicts.slot':
      '{date} at {time} – table {table}, status {status}.',
    'plan.conflicts.holdSlot':
      '{date} at {time} – table {table}, expires {expires}.',
    'plan.conflicts.cta': 'Retry availability',
    'plan.tables.heading': 'Select a table to continue',
    'plan.tables.capacity': 'Seats up to {capacity}',
    'plan.tables.area': 'Area: {area}',

    'details.name': 'Your name',
    'details.phone': 'Phone number',
    'details.email': 'Email address',
    'details.notes': 'Notes',
    'details.notes.help': 'Add special requests or accessibility needs.',
    'details.tables.autoAssign':
      'Our staff will assign the best table automatically when you arrive.',
    'details.consents.title': 'Consents',
    'details.consent.terms':
      'I agree to the Terms of Use and Privacy Policy.',
    'details.consent.updates':
      'Send me updates about venue news and offers.',
    'details.submit': 'Continue to review',
    'details.hold.error': 'We could not create a hold. Pick another slot.',

    'review.heading': 'Review your reservation',
    'review.slot': '{date} at {time}',
    'review.party': 'Party of {party}',
    'review.table.assigned': 'Table {table}',
    'review.table.auto': 'We will auto-assign a table on arrival.',
    'review.contact': 'Contact: {name}, {phone}',
    'review.contactName': 'Guest: {name}',
    'review.phone': 'Phone: {phone}',
    'review.email': 'Email: {email}',
    'review.notes': 'Notes: {notes}',
    'review.notes.none': 'Notes: none provided',
    'review.notProvided': 'Not provided',
    'review.guestFallback': 'Guest',
    'review.consents.marketing': 'Marketing updates',
    'review.consents.required': 'Required consent accepted',
    'review.confirm': 'Confirm reservation',
    'review.confirming': 'Confirming...',
    'review.error':
      'Something went wrong while confirming. Please retry.',
    'review.success.title': 'Reservation confirmed',
    'review.success.code': 'Confirmation code',
    'review.success.manage': 'View or manage reservation',
    'review.success.another': 'Make another reservation',

    'reservation.lookup.loading': 'Retrieving reservation...',
    'reservation.lookup.notFound':
      'We could not find a reservation with that code.',
    'reservation.lookup.error':
      'We hit a snag loading your reservation. Retry in a moment.',
    'reservation.summary.heading': 'Reservation details',
    'reservation.summary.slot': '{date} at {time}',
    'reservation.summary.party': 'Party of {party}',
    'reservation.summary.table': 'Table {table}',
    'reservation.summary.status': 'Status: {status}',
    'reservation.summary.contact': 'Guest: {name}, {phone}',
    'reservation.summary.email': 'Email: {email}',
    'reservation.edit.heading': 'Update reservation',
    'reservation.edit.name': 'Guest name',
    'reservation.edit.phone': 'Phone number',
    'reservation.edit.email': 'Email address',
    'reservation.edit.submit': 'Save changes',
    'reservation.edit.processing': 'Saving changes...',
    'reservation.edit.success': 'Reservation updated.',
    'reservation.edit.error':
      'We could not update the reservation. Try again.',
    'reservation.edit.allowed':
      'You can edit contact details up to {hours} hours before arrival.',
    'reservation.edit.always':
      'You can edit contact details at any time before arrival.',
    'reservation.edit.closed':
      'The edit window has passed. Contact the venue for changes.',
    'reservation.cancel.heading': 'Cancel reservation',
    'reservation.cancel.allowed':
      'You can cancel up to {hours} hours before the visit.',
    'reservation.cancel.always':
      'You can cancel at any point before arrival.',
    'reservation.cancel.closed':
      'The cancellation window has passed. Contact the venue for help.',
    'reservation.cancel.feeNotice':
      'A no-show fee applies if you do not cancel within the window.',
    'reservation.cancel.button': 'Cancel reservation',
    'reservation.cancel.processing': 'Cancelling...',
    'reservation.cancel.success': 'Reservation cancelled.',
    'reservation.cancel.error':
      'We could not cancel the reservation. Try again.',

    'status.PENDING': 'Pending',
    'status.CONFIRMED': 'Confirmed',
    'status.SEATED': 'Seated',
    'status.COMPLETED': 'Completed',
    'status.CANCELLED': 'Cancelled',

    'waitlist.heading': 'Join the waitlist',
    'waitlist.description':
      'Leave your details and we will notify you if a table opens up.',
    'waitlist.name': 'Your name',
    'waitlist.phone': 'Phone number',
    'waitlist.submit': 'Join waitlist',
    'waitlist.success': 'You are on the list. We will be in touch soon.',
    'waitlist.disabled': 'The waitlist is currently disabled.',

    'form.required': 'This field is required.',
  },
  al: {
    'app.title': 'Rezervo një tavolinë',
    'app.description': 'Përfundo rezervimin në tre hapa të thjeshtë.',
    'app.health.ok': 'API: në rregull',
    'app.health.error': 'API: jo aktive',
    'app.health.checking': 'API: kontrollohet...',
    'app.locale.toggle': 'Gjuha',
    'app.locale.en': 'Anglisht',
    'app.locale.al': 'Shqip',

    'wizard.stepOf': 'Hapi {current} nga {total}',
    'wizard.step.plan': 'Planifiko vizitën',
    'wizard.step.details': 'Detajet e mysafirit',
    'wizard.step.review': 'Rishiko & konfirmo',
    'wizard.next': 'Vazhdo',
    'wizard.back': 'Kthehu',
    'wizard.retry': 'Riprovo',

    'plan.party': 'Numri i personave',
    'plan.date': 'Data',
    'plan.time': 'Ora',
    'plan.preference': 'Preferenca e tavolinës',
    'plan.preference.none': 'Pa preferencë (caktohet automatikisht)',
    'plan.preference.warning':
      'Tavolina e zgjedhur mban {capacity}, por grupi është {party}.',
    'plan.submit': 'Kontrollo disponueshmërinë',
    'plan.loading': 'Po kontrollohet disponueshmëria...',
    'plan.error': 'Sistemi i rezervimeve nuk u arrit. Provo sërish.',
    'plan.empty':
      'Nuk ka tavolina të lira. Ndrysho orën ose numrin e personave.',
    'plan.conflicts.title': 'U gjetën konflikte',
    'plan.conflicts.reservations': 'Rezervime ekzistuese',
    'plan.conflicts.holds': 'Mbajtje aktive',
    'plan.conflicts.slot':
      '{date} në {time} – tavolina {table}, statusi {status}.',
    'plan.conflicts.holdSlot':
      '{date} në {time} – tavolina {table}, skadon {expires}.',
    'plan.conflicts.cta': 'Rifresko disponueshmërinë',
    'plan.tables.heading': 'Zgjidh një tavolinë për të vazhduar',
    'plan.tables.capacity': 'Deri në {capacity} persona',
    'plan.tables.area': 'Zona: {area}',

    'details.name': 'Emri juaj',
    'details.phone': 'Numri i telefonit',
    'details.email': 'Adresa e email-it',
    'details.notes': 'Shënime',
    'details.notes.help': 'Shtoni kërkesa të veçanta ose nevoja për aksesueshmëri.',
    'details.tables.autoAssign':
      'Stafi do të caktojë automatikisht tavolinën më të përshtatshme.',
    'details.consents.title': 'Pëlqimet',
    'details.consent.terms':
      'Pranoj Kushtet e Përdorimit dhe Politikën e Privatësisë.',
    'details.consent.updates':
      'Më dërgo njoftime për lajme dhe oferta të lokalit.',
    'details.submit': 'Vazhdo te rishikimi',
    'details.hold.error': 'Nuk u krijua mbajtja. Zgjidh një orar tjetër.',

    'review.heading': 'Rishiko rezervimin',
    'review.slot': '{date} në {time}',
    'review.party': 'Grup prej {party} personash',
    'review.table.assigned': 'Tavolina {table}',
    'review.table.auto': 'Tavolina caktohet në mbërritje.',
    'review.contact': 'Kontakti: {name}, {phone}',
    'review.contactName': 'Mysafir: {name}',
    'review.phone': 'Telefon: {phone}',
    'review.email': 'Email: {email}',
    'review.notes': 'Shënime: {notes}',
    'review.notes.none': 'Shënime: asnjë shënim',
    'review.notProvided': 'Pa të dhëna',
    'review.guestFallback': 'Mysafir',
    'review.consents.marketing': 'Pëlqimi për njoftime',
    'review.consents.required': 'Pëlqimi i detyrueshëm u pranua',
    'review.confirm': 'Konfirmo rezervimin',
    'review.confirming': 'Po konfirmohet...',
    'review.error':
      'Ndodhi një gabim gjatë konfirmimit. Provo përsëri.',
    'review.success.title': 'Rezervimi u konfirmua',
    'review.success.code': 'Kodi i konfirmimit',
    'review.success.manage': 'Shiko ose menaxho rezervimin',
    'review.success.another': 'Krijo një rezervim tjetër',

    'reservation.lookup.loading': 'Po kërkohet rezervimi...',
    'reservation.lookup.notFound':
      'Nuk u gjet rezervim me këtë kod.',
    'reservation.lookup.error':
      'Pati një problem gjatë ngarkimit. Provo pak më vonë.',
    'reservation.summary.heading': 'Detajet e rezervimit',
    'reservation.summary.slot': '{date} në {time}',
    'reservation.summary.party': 'Grup prej {party} personash',
    'reservation.summary.table': 'Tavolina {table}',
    'reservation.summary.status': 'Statusi: {status}',
    'reservation.summary.contact': 'Mysafiri: {name}, {phone}',
    'reservation.summary.email': 'Email: {email}',
    'reservation.edit.heading': 'Përditëso rezervimin',
    'reservation.edit.name': 'Emri i mysafirit',
    'reservation.edit.phone': 'Numri i telefonit',
    'reservation.edit.email': 'Adresa e email-it',
    'reservation.edit.submit': 'Ruaj ndryshimet',
    'reservation.edit.processing': 'Po ruhen ndryshimet...',
    'reservation.edit.success': 'Rezervimi u përditësua.',
    'reservation.edit.error':
      'Rezervimi nuk u përditësua. Provo përsëri.',
    'reservation.edit.allowed':
      'Mund t\'i përditësoni të dhënat deri në {hours} orë para mbërritjes.',
    'reservation.edit.always':
      'Mund t\'i përditësoni të dhënat deri në momentin e mbërritjes.',
    'reservation.edit.closed':
      'Afati për ndryshime ka skaduar. Kontaktoni lokalin për ndihmë.',
    'reservation.cancel.heading': 'Anulo rezervimin',
    'reservation.cancel.allowed':
      'Mund ta anuloni deri në {hours} orë para vizitës.',
    'reservation.cancel.always':
      'Mund ta anuloni në çdo moment para mbërritjes.',
    'reservation.cancel.closed':
      'Afati i anulimit ka kaluar. Kontaktoni lokalin për ndihmë.',
    'reservation.cancel.feeNotice':
      'Pas afatit mund të aplikohet tarifë për mosparaqitje.',
    'reservation.cancel.button': 'Anulo rezervimin',
    'reservation.cancel.processing': 'Po anulohet...',
    'reservation.cancel.success': 'Rezervimi u anulua.',
    'reservation.cancel.error':
      'Rezervimi nuk u anulua. Provo përsëri.',

    'status.PENDING': 'Në pritje',
    'status.CONFIRMED': 'E konfirmuar',
    'status.SEATED': 'Ulet',
    'status.COMPLETED': 'E përfunduar',
    'status.CANCELLED': 'E anuluar',

    'waitlist.heading': 'Bashkohu me listën e pritjes',
    'waitlist.description':
      'Lini të dhënat dhe do t\'ju njoftojmë kur të lirohet një tavolinë.',
    'waitlist.name': 'Emri juaj',
    'waitlist.phone': 'Numri i telefonit',
    'waitlist.submit': 'Bashkohu në listë',
    'waitlist.success':
      'U shtuat në listë. Do t\'ju kontaktojmë sa më shpejt.',
    'waitlist.disabled': 'Lista e pritjes është e çaktivizuar për momentin.',

    'form.required': 'Kjo fushë është e detyrueshme.',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)['en'];

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey, values?: Values) => string;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'booking-widget:locale';
const SUPPORTED_LOCALES: Locale[] = ['en', 'al'];

function format(template: string, values?: Values) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, token) => {
    const replacement = values[token];
    return replacement === undefined ? match : String(replacement);
  });
}

function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return 'en';
  const lower = input.toLowerCase();
  return SUPPORTED_LOCALES.includes(lower as Locale) ? (lower as Locale) : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? localStorage.getItem(LOCAL_STORAGE_KEY)
        : null;
    const candidate =
      stored ||
      (typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en');
    setLocaleState(normalizeLocale(candidate));
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const translate = useCallback(
    (key: TranslationKey, values?: Values) => {
      const dictionary = translations[locale] ?? translations.en;
      const template = dictionary[key] ?? translations.en[key] ?? key;
      return format(template, values);
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: translate,
    }),
    [locale, setLocale, translate],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}

export const localeOptions: Array<{ value: Locale; labelKey: TranslationKey }> = [
  { value: 'en', labelKey: 'app.locale.en' },
  { value: 'al', labelKey: 'app.locale.al' },
];
