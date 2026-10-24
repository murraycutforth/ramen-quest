// Geolocation is only ever requested in response to a tap (Nearest sort, locate me).

let last = null;
const listeners = new Set();

export const lastPosition = () => last;
export const onPosition = (fn) => listeners.add(fn);

export async function hasGeoPermission() {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    return p?.state === 'granted';
  } catch {
    return false;
  }
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        last = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        listeners.forEach((fn) => fn(last));
        resolve(last);
      },
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
