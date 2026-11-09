import { FactList } from '@greenscape/ui/layout/primitives';
import { cms } from '@/lib/cms';

/** Contact facts from the CMS site config. The map is a link (no third-party iframe on page load). */
export async function ContactDetails() {
  const site = await cms.site();
  const c = site?.config;
  if (!c) return null;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Greenscape ${c.address}`)}`;
  return (
    <FactList
      items={[
        {
          term: 'Visit',
          detail: (
            <>
              {c.address}
              <br />
              <a href={mapUrl} rel="noopener" className="text-ink">
                Open in Google Maps
              </a>
            </>
          ),
        },
        { term: 'Call', detail: <a href={`tel:+63${c.phone.replace(/\D/g, '').replace(/^0/, '')}`} className="text-ink">{c.phone}</a> },
        { term: 'Email', detail: <a href={`mailto:${c.email}`} className="text-ink">{c.email}</a> },
        ...(c.hours ? [{ term: 'Hours', detail: c.hours }] : []),
        ...(c.socials.facebook || c.socials.instagram
          ? [
              {
                term: 'Follow',
                detail: (
                  <span className="flex flex-wrap gap-4">
                    {c.socials.facebook && <a href={c.socials.facebook} rel="noopener" className="text-ink">Facebook</a>}
                    {c.socials.instagram && <a href={c.socials.instagram} rel="noopener" className="text-ink">Instagram</a>}
                  </span>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
