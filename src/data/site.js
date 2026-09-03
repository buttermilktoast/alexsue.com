// Single source of truth for editable site content.
// Update this file to change the page; components read from it.

export const site = {
  domain: 'alexsue.com',
  name: 'Alex Sue',
  tagline: 'personal status dashboard',
  email: 'alex@alexsue.com',

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
      url: null,
      status: 'live',
      tag: 'web'
    },
    {
      title: 'Alika',
      description: 'AI assistant / RAG experiment',
      url: null,
      status: 'in progress',
      tag: 'ai'
    },
    {
      title: 'Small Tools',
      description: 'Things built because they were useful',
      url: null,
      status: null,
      tag: 'misc'
    }
  ],

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
    { label: 'alex@alexsue.com', href: 'mailto:alex@alexsue.com', external: false }
  ]
}

export default site
