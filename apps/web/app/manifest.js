export default function manifest() {
  return {
    id: '/',
    name: 'NetField',
    short_name: 'NetField',
    description: 'Field tasks, bank tickets, hardware flow, and team chat in one place',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      {
        src: '/netfield-icon.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
