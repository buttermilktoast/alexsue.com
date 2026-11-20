<script setup>
defineProps({ name: String })

const paths = {
  brief: 'M4 19V5h16v14H4Zm4-10h4v5H8V9Zm8 0h1m-1 4h1M8 16h9',
  image: 'M3 5h18v14H3V5Zm3 11 4-5 3 3 2-2 3 4M15.5 8.5h.01',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 8a8 8 0 1 0 .3 7M20 4v5h-5',
  grid: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
  news: 'M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h5',
  tech: 'M6 6h12v12H6zM9 9h6v6H9zM9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3',
  games: 'M7 8h10c2 0 3 2 4 6 1 4-2 4-5 1H8c-3 3-6 3-5-1 1-4 2-6 4-6Zm0 4h4m-2-2v4m6-2h.01m3 0h.01',
  comic: 'M4 5h16v12H9l-5 3V5Zm4 6h.01m4 0h.01m4 0h.01',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'M15.5 15.5 20 20M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  link: 'M10 13a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-2 2m2 4a3 3 0 0 0-4 0l-4 4a3 3 0 0 0 4 4l2-2',
}
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="name === 'grip' ? 2.8 : 1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>
