export const PLACES = [
  {
    id: 'accra-mall',
    name: 'Accra Mall',
    city: 'Accra',
    lat: 5.6228,
    lng: -0.1735,
  },
  {
    id: 'kotoka',
    name: 'Kotoka Airport',
    city: 'Accra',
    lat: 5.6052,
    lng: -0.1668,
  },
  {
    id: 'osu',
    name: 'Osu Oxford Street',
    city: 'Accra',
    lat: 5.5564,
    lng: -0.1825,
  },
  {
    id: 'circle',
    name: 'Kwame Nkrumah Circle',
    city: 'Accra',
    lat: 5.5691,
    lng: -0.2158,
  },
  {
    id: 'legon',
    name: 'University of Ghana, Legon',
    city: 'Accra',
    lat: 5.6506,
    lng: -0.187,
  },
  {
    id: 'independence',
    name: 'Independence Square',
    city: 'Accra',
    lat: 5.5489,
    lng: -0.1925,
  },
  {
    id: 'knust',
    name: 'KNUST Main Gate',
    city: 'Kumasi',
    lat: 6.6748,
    lng: -1.5717,
  },
  {
    id: 'kejetia',
    name: 'Kejetia Market',
    city: 'Kumasi',
    lat: 6.6986,
    lng: -1.6238,
  },
  {
    id: 'tamale-airport',
    name: 'Tamale Airport',
    city: 'Tamale',
    lat: 9.5572,
    lng: -0.8632,
  },
  {
    id: 'tamale-market',
    name: 'Tamale Central Market',
    city: 'Tamale',
    lat: 9.4008,
    lng: -0.8393,
  },
  {
    id: 'tarkwa',
    name: 'Tarkwa Station',
    city: 'Tarkwa',
    lat: 5.3038,
    lng: -1.9895,
  },
  {
    id: 'umat',
    name: 'UMaT Main Gate',
    city: 'Tarkwa',
    lat: 5.2974,
    lng: -1.9965,
  },
];
export const CARS = [
  {
    id: 'standard',
    title: 'DropIn Go',
    description: 'Everyday rides, easy fares',
    seats: 4,
    multiplier: 1,
  },
  {
    id: 'comfort',
    title: 'DropIn Comfort',
    description: 'A little extra room to relax',
    seats: 4,
    multiplier: 1.35,
  },
  {
    id: 'xl',
    title: 'DropIn XL',
    description: 'Bring the whole crew',
    seats: 6,
    multiplier: 1.7,
  },
];
export function distance(a: any, b: any) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function fareFor(
  pickup: string,
  dropoff: string,
  type: string,
  settings: any
) {
  const a = PLACES.find(p => p.id === pickup),
    b = PLACES.find(p => p.id === dropoff);
  const car = CARS.find(c => c.id === type);
  if (!a || !b || !car || a.city !== b.city || a.id === b.id)
    throw new Error('Choose two different places in the same city.');
  const km = Math.round(distance(a, b) * 1.35 * 10) / 10;
  const minutes = Math.max(5, Math.round(km * 3));
  return {
    km,
    minutes,
    fare: Math.max(
      settings.minimum,
      Math.round((settings.base + km * settings.perKm) * car.multiplier * 100) /
        100
    ),
  };
}
export function initialState() {
  return {
    settings: { base: 8, perKm: 3.5, minimum: 15, commission: 15 },
    rides: [],
    applications: [],
    drivers: [
      {
        id: 'kwame',
        name: 'Kwame Mensah',
        city: 'Accra',
        vehicle: 'Toyota Corolla',
        plate: 'DEMO · 01',
        type: 'standard',
        online: true,
        approved: true,
        lat: 5.618,
        lng: -0.176,
        rating: 4.9,
      },
      {
        id: 'ama',
        name: 'Ama Boateng',
        city: 'Accra',
        vehicle: 'Toyota Camry',
        plate: 'DEMO · 02',
        type: 'comfort',
        online: true,
        approved: true,
        lat: 5.6,
        lng: -0.173,
        rating: 4.8,
      },
      {
        id: 'kojo',
        name: 'Kojo Asare',
        city: 'Accra',
        vehicle: 'Toyota Sienta',
        plate: 'DEMO · 03',
        type: 'xl',
        online: true,
        approved: true,
        lat: 5.61,
        lng: -0.18,
        rating: 4.9,
      },
      {
        id: 'yaw',
        name: 'Yaw Owusu',
        city: 'Kumasi',
        vehicle: 'Hyundai i10',
        plate: 'DEMO · 04',
        type: 'standard',
        online: true,
        approved: true,
        lat: 6.69,
        lng: -1.605,
        rating: 4.8,
      },
      {
        id: 'fati',
        name: 'Fati Abubakar',
        city: 'Tamale',
        vehicle: 'Toyota Vitz',
        plate: 'DEMO · 05',
        type: 'standard',
        online: true,
        approved: true,
        lat: 9.407,
        lng: -0.838,
        rating: 4.9,
      },
      {
        id: 'kofi',
        name: 'Kofi Appiah',
        city: 'Tarkwa',
        vehicle: 'Kia Picanto',
        plate: 'DEMO · 06',
        type: 'standard',
        online: true,
        approved: true,
        lat: 5.305,
        lng: -1.99,
        rating: 4.7,
      },
    ],
  };
}
export function applyCommand(previous: any, command: any) {
  const state = JSON.parse(JSON.stringify(previous));
  if (!command || typeof command.action !== 'string')
    throw new Error('Invalid action');
  const active = (r: any) => !['completed', 'cancelled'].includes(r.status);
  switch (command.action) {
    case 'book': {
      if (state.rides.some(active))
        throw new Error('Finish or cancel your current ride first.');
      if (state.rides.length >= 30)
        throw new Error(
          'This demo has reached 30 trips. Start a new demo from the header.'
        );
      if (command.payment !== 'cash')
        throw new Error(
          'MoMo processing is not configured. Use cash in the demo.'
        );
      const quote = fareFor(
        command.pickup,
        command.dropoff,
        command.type,
        state.settings
      );
      const place = PLACES.find(p => p.id === command.pickup)!;
      const candidates = state.drivers.filter(
        (d: any) =>
          d.approved &&
          d.online &&
          d.type === command.type &&
          d.city === place.city &&
          !state.rides.some((r: any) => active(r) && r.driverId === d.id)
      );
      candidates.sort(
        (a: any, b: any) => distance(a, place) - distance(b, place)
      );
      const driver = candidates[0];
      const ride = {
        id: 'DI-' + String(state.rides.length + 1).padStart(4, '0'),
        pickup: command.pickup,
        dropoff: command.dropoff,
        type: command.type,
        payment: 'cash',
        ...quote,
        commissionPercent: state.settings.commission,
        status: driver ? 'offered' : 'searching',
        driverId: driver?.id || null,
        createdAt: Date.now(),
        rating: null,
      };
      state.rides.unshift(ride);
      break;
    }
    case 'dispatch': {
      const ride = state.rides.find((r: any) => r.id === command.id);
      if (!ride || ride.status !== 'searching')
        throw new Error('Only searching rides can be dispatched.');
      const place = PLACES.find(p => p.id === ride.pickup)!;
      const candidates = state.drivers.filter(
        (d: any) =>
          d.approved &&
          d.online &&
          d.city === place.city &&
          d.type === ride.type &&
          !state.rides.some((r: any) => active(r) && r.driverId === d.id)
      );
      candidates.sort(
        (a: any, b: any) => distance(a, place) - distance(b, place)
      );
      if (!candidates.length)
        throw new Error(
          'No matching driver is online. Change driver availability or cancel.'
        );
      ride.driverId = candidates[0].id;
      ride.status = 'offered';
      break;
    }
    case 'ride': {
      const ride = state.rides.find((r: any) => r.id === command.id);
      if (!ride) throw new Error('Ride not found');
      const transitions: Record<string, string> = {
        offered: 'accepted',
        accepted: 'arrived',
        arrived: 'in_progress',
        in_progress: 'completed',
      };
      if (command.status === 'cancelled') {
        if (
          !['searching', 'offered', 'accepted', 'arrived'].includes(ride.status)
        )
          throw new Error('This ride can no longer be cancelled.');
      } else {
        if (ride.driverId !== command.driverId)
          throw new Error('Only the assigned driver can update this trip.');
        if (transitions[ride.status] !== command.status)
          throw new Error('Invalid trip status transition.');
      }
      ride.status = command.status;
      if (ride.status === 'completed') {
        ride.completedAt = Date.now();
        ride.driverEarnings =
          Math.round(ride.fare * (1 - ride.commissionPercent / 100) * 100) /
          100;
      }
      break;
    }
    case 'rate': {
      const ride = state.rides.find((r: any) => r.id === command.id);
      if (!ride || ride.status !== 'completed' || ride.rating)
        throw new Error('Only an unrated completed ride can be rated.');
      if (![1, 2, 3, 4, 5].includes(command.rating))
        throw new Error('Choose 1 to 5 stars.');
      ride.rating = command.rating;
      break;
    }
    case 'availability': {
      const driver = state.drivers.find((d: any) => d.id === command.id);
      if (!driver) throw new Error('Driver not found.');
      if (state.rides.some((r: any) => active(r) && r.driverId === driver.id))
        throw new Error(
          'Complete the assigned trip before changing availability.'
        );
      driver.online = !!command.online;
      break;
    }
    case 'settings': {
      const s = command.settings;
      if (
        !s ||
        ![s.base, s.perKm, s.minimum, s.commission].every(
          (n: any) => typeof n === 'number' && Number.isFinite(n)
        )
      )
        throw new Error('Enter valid fare amounts.');
      if (
        s.base < 0 ||
        s.perKm <= 0 ||
        s.minimum < 1 ||
        s.commission < 0 ||
        s.commission > 40 ||
        s.base > 100 ||
        s.perKm > 50 ||
        s.minimum > 500
      )
        throw new Error('Fare settings are out of range.');
      state.settings = s;
      break;
    }
    case 'apply': {
      if (state.applications.length >= 20)
        throw new Error('Demo application limit reached.');
      const name = String(command.name || '').trim(),
        vehicle = String(command.vehicle || '').trim();
      if (
        name.length < 2 ||
        name.length > 60 ||
        vehicle.length < 2 ||
        vehicle.length > 60 ||
        !['Accra', 'Kumasi', 'Tamale', 'Tarkwa'].includes(command.city)
      )
        throw new Error('Enter a sample name, vehicle, and service city.');
      state.applications.unshift({
        id: 'APP-' + (state.applications.length + 1),
        name,
        vehicle,
        city: command.city,
        type: 'standard',
        status: 'pending',
      });
      break;
    }
    case 'approve': {
      const app = state.applications.find((a: any) => a.id === command.id);
      if (!app || app.status !== 'pending')
        throw new Error('Application is not pending.');
      app.status = command.approve ? 'approved' : 'rejected';
      if (command.approve) {
        const place = PLACES.find(p => p.city === app.city)!;
        state.drivers.push({
          ...app,
          id: app.id,
          plate: 'DEMO · NEW',
          approved: true,
          online: false,
          rating: 5,
          lat: place.lat,
          lng: place.lng,
        });
      }
      break;
    }
    default:
      throw new Error('Unknown action');
  }
  return state;
}
