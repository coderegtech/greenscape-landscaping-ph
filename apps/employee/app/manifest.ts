import { manifestFor } from '@greenscape/ui/pwa/app';

// Served at /manifest.webmanifest on this app's own origin: its own name, icon, colours and scope.
export default function manifest() {
  return manifestFor('employee');
}
