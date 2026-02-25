# 🧪 Тестирование Discord-like Screen Sharing Platform

## ✅ Статус Компонентов

### Backend (Signaling Server)
- **Порт:** 3001
- **Статус:** ✅ Запущен
- **Проверка:** `curl http://localhost:3001/health` или `GET /health` → `{"ok": true}`
- **WebSocket:** `ws://localhost:3001`
- **Функции:**
  - 📊 Peer discovery & routing
  - 🔒 Max 15 users per room (MAX_PEERS_PER_ROOM = 15)
  - ❄️ 5 STUN серверы (Google)
  - 🛡️ Error handling & room cleanup

### Frontend (Next.js App)
- **Порт:** 3000
- **Статус:** ✅ Запущен
- **URL:** `http://localhost:3000`
- **Функции:**
  - 📹 Screen capture with WebRTC
  - 🎬 Quality Selection: 1080p, 1440p, 2160p (4K)
  - ⚡ FPS Selection: 30fps или 60fps для каждого качества
  - 📊 Adaptive Bitrate Monitoring
  - 👥 Up to 15 concurrent users
  - 🎨 Modern UI with Glassmorphism Design

## 🧪 Инструкция по Тестированию

### Локальное Тестирование (на одном компьютере)

#### 1️⃣ Шаг 1: Откройте 3 вкладки браузера
```
1. http://localhost:3000
2. http://localhost:3000
3. http://localhost:3000
```

#### 2️⃣ Шаг 2: В каждой вкладке установите качество и FPS
- **Вкладка 1 (Sharer):** 1080p @ 30fps
- **Вкладка 2 (Viewer):** 1440p @ 60fps
- **Вкладка 3 (Viewer):** 2160p @ 60fps

#### 3️⃣ Шаг 3: На вкладке 1 нажмите кнопку "Share Screen"
- Выберите монитор или окно приложения
- Изображение должно появиться в вкладках 2 и 3

#### 4️⃣ Шаг 4: Проверьте статистику
- **Peer Count:** Должно показать "2/14" (2 зрителя + 1 шеринг = 3 всего)
- **Bitrate:** Должна адаптироваться основе сетей
- **FPS:** Должна показать выбранное значение

#### 5️⃣ Шаг 5: Тест лимита на 15 пользователей
- Откройте 15-ю вкладку
- Через несколько секунд она должна получить ошибку "Room is full"
- Backend должен логировать: `[room-name] Peer [id] left. Total: 14/15`

### Проверка Logов

#### Backend Логирование
```bash
cd apps/backend
npm run dev
# Смотрите логи для peer join/leave:
# 🚀 Signaling server listening on port 3001
# 📊 Max peers per room: 15
# [room-0] Peer abc1234d joined. Total: 1/15
# [room-0] Peer def5678e joined. Total: 2/15
```

#### Frontend Вывод (DevTools Console)
```javascript
// Должны быть логи типа:
console.log("🔗 Connected to room:", roomId);
console.log("👥 Peers in room:", peerList);
console.log("📊 Bitrate:", bitrate, "Mbps");
console.log("⚡ FPS:", fps);
```

## 📊 Параметры Качества

| Качество | Разрешение | 30fps | 60fps |
|----------|-----------|-------|-------|
| **1080p** | 1920×1080 | 8 Mbps | 16 Mbps |
| **1440p** | 2560×1440 | 16 Mbps | 32 Mbps |
| **2160p** | 3840×2160 | 35 Mbps | 60 Mbps |

> **Примечание:** Фактический битрейт будет адаптироваться в зависимости от пропускной способности сети.

## 🔧 Troubleshooting

### ❌ "Connection failed to the WebSocket server"
```
1. Проверьте, запущен ли backend: http://localhost:3001/health
2. Проверьте NEXT_PUBLIC_SIGNALING_URL в .env.local
3. По умолчанию: ws://localhost:3001
```

### ❌ "Room is full" при подключении 15-го пользователя
```
✅ Это нормально! Это означает, что лимит работает правильно.
```

### ❌ "Screen capture failed"
```
1. Разрешите доступ камере/экрану в браузере
2. Используйте Chrome/Edge/Firefox (самые свежие версии)
3. Требуется HTTPS для production (development работает на HTTP)
```

### ❌ Высокая задержка (lag)
```
1. Проверьте скорость интернета
2. Уменьшите качество/FPS если нужно (1080p @ 30fps)
3. Убедитесь, что оба пира в одной комнате
```

## 🚀 Deployment на Vercel

### Подготовка:

1. **Frontend (Next.js):** Готов к Vercel
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Backend:** Должен быть на отдельном сервере
   - DigitalOcean, AWS, Heroku, или любой VPS
   - Установить Node.js и запустить `npm run dev`
   - Обновить `NEXT_PUBLIC_SIGNALING_URL=https://your-backend.com:3001`

### шаги Deployment:

```bash
# Frontend на Vercel
cd apps/frontend
vercel --prod

# Backend на VPS
# 1. SSH на сервер
# 2. git clone <repo>
# 3. cd apps/backend && npm install
# 4. npm run dev  (или используйте PM2)
```

## ✨ Функции Системы

### ✅ Реализовано
- [x] WebRTC P2P mesh network (до 15 пользователей)
- [x] Screen sharing (getDisplayMedia)
- [x] Quality selection (1080p, 1440p, 2160p)
- [x] FPS selection (30fps и 60fps для каждого качества)
- [x] Adaptive bitrate monitoring
- [x] Peer limiting (max 15 users)
- [x] Modern UI (glassmorphism, dark theme, responsive)
- [x] WebSocket signaling server
- [x] Vercel configuration
- [x] Docker support
- [x] Error handling & room cleanup
- [x] 5 STUN servers for NAT traversal

### 📋 Future Improvements
- [ ] Recording functionality
- [ ] Chat integration
- [ ] Audio/video call mixing
- [ ] SFU (Selective Forwarding Unit) for >15 users
- [ ] TURN server configuration
- [ ] Bandwidth monitoring per peer
- [ ] Picture-in-picture mode
- [ ] Device selection (camera, mic, speaker)

## 📝 Файлы Проекта

```
discord-online/
├── apps/
│   ├── frontend/
│   │   ├── pages/index.tsx (WebRTC logic + UI)
│   │   ├── styles/home.module.css (Modern styling)
│   │   ├── styles/globals.css (Global styles)
│   │   ├── vercel.json (Vercel config)
│   │   ├── next.config.js (Next.js config)
│   │   └── package.json
│   │
│   └── backend/
│       ├── src/index.ts (Signaling server)
│       ├── package.json
│       └── Dockerfile
│
├── docker-compose.yml (Both services)
├── README.md (Full documentation)
└── TEST_GUIDE.md (This file)
```

## 🎯 Ключевые Параметры

### Backend Configuration
- **MAX_PEERS_PER_ROOM:** 15
- **STUN Servers:** 5 (Google endpoints)
- **Port:** 3001
- **Framework:** Express.js + WebSocket

### Frontend Configuration
- **Framework:** Next.js 13.5.6
- **Port:** 3000
- **Styling:** CSS Modules (Glassmorphism)
- **WebRTC:** Native browser API
- **Max Peers:** 14 (+ self = 15 total)

## 🔐 Security Notes

- ✅ CORS enabled on backend
- ✅ WebSocket authentication ready (can be enhanced)
- ✅ Room-based isolation (users can't see other rooms)
- ⚠️ Development mode: No auth required
- 🔒 Production: Add authentication & TURN servers

---

**Статус:** ✅ Проект готов к локальному тестированию и развертыванию  
**Последнее обновление:** 25 февраля 2026  
**Версия:** MVP 1.0 с поддержкой 15 пользователей
