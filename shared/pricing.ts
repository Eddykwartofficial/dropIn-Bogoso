export type VehicleType = 'standard' | 'comfort' | 'xl';

export const VEHICLES: {
  id: VehicleType;
  title: string;
  description: string;
  seats: number;
  multiplier: number;
}[] = [
  { id: 'standard', title: 'DropIn Go', description: 'Everyday rides, easy fares', seats: 4, multiplier: 1 },
  { id: 'comfort', title: 'DropIn Comfort', description: 'A little extra room to relax', seats: 4, multiplier: 1.35 },
  { id: 'xl', title: 'DropIn XL', description: 'Bring the whole crew', seats: 6, multiplier: 1.7 },
];

export const CITIES = ['Accra', 'Kumasi', 'Tamale', 'Tarkwa', 'Takoradi', 'Cape Coast', 'Ho', 'Koforidua', 'Sunyani', 'Bogoso'];

export type FareSettings = {
  base: number;
  perKm: number;
  perMinute: number;
  minimum: number;
  commission: number;
};

export const RIDE_STATUSES = ['searching', 'offered', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled'] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];
export const ACTIVE_STATUSES: RideStatus[] = ['searching', 'offered', 'accepted', 'arrived', 'in_progress'];

export const STATUS_LABELS: Record<RideStatus, string> = {
  searching: 'Finding a driver',
  offered: 'Waiting for driver to accept',
  accepted: 'Driver on the way',
  arrived: 'Driver has arrived',
  in_progress: 'On trip',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function isVehicleType(v: unknown): v is VehicleType {
  return VEHICLES.some(x => x.id === v);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad;
  const dlng = (b.lng - a.lng) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function priceFor(km: number, minutes: number, type: VehicleType, s: FareSettings) {
  const vehicle = VEHICLES.find(v => v.id === type)!;
  const raw = (s.base + km * s.perKm + minutes * s.perMinute) * vehicle.multiplier;
  return Math.max(s.minimum, Math.round(raw * 100) / 100);
}

export function driverShare(fare: number, commissionPercent: number) {
  return Math.round(fare * (1 - commissionPercent / 100) * 100) / 100;
}

export function isGhanaPhone(phone: string) {
  return /^(\+233|0)[235]\d{8}$/.test(phone.replace(/[\s-]/g, ''));
}
