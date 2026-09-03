// Single source of truth for editable site content.
// Update this file to change the page; components read from it.

export const site = {
  domain: 'alexsue.com',
  name: 'Alex Sue',
  tagline: 'personal status dashboard',

  now: {
    currentProject: {
      name: 'alexsue.com',
      description: 'This page. A small static status dashboard.',
      url: null
    },
    items: [
      'Building small web tools',
      'Experimenting with things that seem useful'
    ]
  },

  projects: [
    {
      title: 'Hawaiʻi Permit Prep',
      description: "Practice tests for the Hawaiʻi driver's permit exam",
      url: 'https://hawaii-permit-prep.buttermilktoast.chatgpt.site/',
      status: 'live',
      tag: 'web'
    },
    {
      title: 'Hoops',
      description: 'Basketball game for iPhone and iPad',
      url: 'https://hoops.gopherapps.com',
      status: 'on the App Store',
      tag: 'ios'
    },
    {
      title: 'Unique Daily Affirmations',
      description: 'A fresh affirmation every day, on iOS',
      url: 'https://uniquedailyaffirmations.com',
      status: 'on the App Store',
      tag: 'ios'
    },
    {
      title: 'Small Tools',
      description: 'Things built because they were useful',
      url: null,
      status: null,
      tag: 'misc'
    }
  ],

  // Live health data pushed from the phone to S3. Rows render only while the
  // payload is fresher than staleAfterMs; otherwise the section falls back to
  // the static rows below.
  live: {
    url: import.meta.env.VITE_STATUS_URL || null,
    // Polls land on wall-clock slots at offsetMs past each interval -- :05,
    // :20, :35 and :50 -- so a poll follows the phone's on-the-hour push by
    // about five minutes instead of trailing it by up to a full interval.
    intervalMs: 15 * 60 * 1000,
    offsetMs: 5 * 60 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000
  },

  // state: 'ok' | 'warn' | 'idle'
  statuses: [
    { label: 'Site', value: 'operational', state: 'ok' },
    { label: 'Side projects', value: 'too many', state: 'warn' },
    { label: 'Current device', value: 'MacBook', state: 'idle' },
    { label: 'Listening', value: '—', state: 'idle' },
    { label: 'Reading', value: '—', state: 'idle' },
    { label: 'Playing', value: '—', state: 'idle' }
  ],

  links: [
    { label: 'GitHub', href: 'https://github.com/buttermilktoast', external: true },
    { label: 'Instagram', href: 'https://instagram.com/buttermilktoasty', external: true }
  ]
}

export default site
