import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initAnalytics } from './analytics'

createApp(App).mount('#app')
initAnalytics()
