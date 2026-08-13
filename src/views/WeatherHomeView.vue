<script setup>
import { useRouter } from 'vue-router'
import WeatherHome from '../components/weather/WeatherHome.vue'
const router = useRouter()
const openDetail = ({ id }) => router.push(`/weather/${id}`)
</script>
<template><WeatherHome @click-detail="openDetail" /></template>
