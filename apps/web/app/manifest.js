export default function manifest() {
  return {
    id: '/',
    name: 'TrackField',
    short_name: 'TrackField',
    description: 'Field tasks, bank tickets, hardware flow, and team chat in one place',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      {
        src: '/trackfield-icon.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
