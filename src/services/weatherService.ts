import { OPENWEATHER_API_KEY } from '@/constants/api';

export const fetchWeatherData = async () => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=40.77&longitude=30.37&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FIstanbul&forecast_days=2`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Hava durumu verisi alınamadı');
    
    const data = await response.json();
    
    // WMO Weather Code to text
    const wmoToText = (code: number) => {
      if (code === 0) return 'Açık';
      if (code === 1 || code === 2 || code === 3) return 'Parçalı Bulutlu';
      if (code === 45 || code === 48) return 'Sisli';
      if (code === 51 || code === 53 || code === 55) return 'Çiseleyen Yağmur';
      if (code >= 61 && code <= 65) return 'Yağmurlu';
      if (code >= 71 && code <= 77) return 'Kar Yağışlı';
      if (code >= 95) return 'Fırtınalı';
      return 'Bulutlu';
    };

    // Saatlik verileri ayıkla (şuan ve sonraki 12 saat)
    const currentHourIndex = new Date().getHours();
    const hourly = [];
    
    for (let i = 0; i < 12; i++) {
      const idx = currentHourIndex + i;
      if (idx < data.hourly.time.length) {
        const timeString = data.hourly.time[idx]; // e.g. "2023-07-28T15:00"
        const hour = new Date(timeString).getHours();
        hourly.push({
          time: `${hour.toString().padStart(2, '0')}:00`,
          temp: Math.round(data.hourly.temperature_2m[idx]),
          prob: data.hourly.precipitation_probability[idx],
        });
      }
    }

    return {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      humidity: Math.round(data.current.relative_humidity_2m),
      windSpeed: Math.round(data.current.wind_speed_10m),
      description: wmoToText(data.current.weather_code),
      hourly,
    };
  } catch (error) {
    console.error('Weather API Error:', error);
    return {
      temp: 30,
      feelsLike: 32,
      humidity: 50,
      windSpeed: 10,
      description: 'Açık',
      hourly: [
        { time: '12:00', temp: 30, prob: 0 },
        { time: '13:00', temp: 31, prob: 0 },
        { time: '14:00', temp: 32, prob: 0 },
        { time: '15:00', temp: 32, prob: 5 },
      ],
    };
  }
};
