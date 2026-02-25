# Архитектурный документ

## MVP (Current) vs Production Roadmap

### Текущая архитектура (MVP - 0.1.0)

```
┌──────────────────────┐         ┌──────────────────────┐
│     Browser 1        │         │     Browser 2        │
│  (Next.js Frontend)  │         │  (Next.js Frontend)  │
│   - UI & Capture     │         │   - Playback         │
│   - WebRTC P2P       │         │   - WebRTC P2P       │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           │          WebRTC DTLS           │
           ├────────────────────────────────┤
           │                                │
           │                                │
           └────────┬──────────────────────┘
                    │
             ┌──────┴─────────┐
             │  WebSocket     │
             │  Signaling     │
             │  (Express)     │
             │  Port: 3001    │
             └────────────────┘
```

**Масштабируемость:** 1-3 пользователя (mesh P2P)

### Проблемы MVP

- ❌ Mesh P2P неэффективен для 3+ пользователей (N² соединений)
- ❌ Нет аутентификации пользователей
- ❌ Нет persistation (DB) пользователей/комнат
- ❌ Нет TURN сервера (не работает через NAT)
- ❌ Нет чата
- ❌ Нет мониторинга/логирования
- ❌ Нет масштабирования (K8s)

---

## Production Roadmap (Phase 2-4)

### Phase 2: SFU Architecture (3-20 пользователей)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Browser 1    │  │ Browser 2    │  │ Browser N    │
│ (Sender/Recv)│  │ (Recv)       │  │ (Recv)       │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │       WebRTC    │       WebRTC    │
       ├─────────────────┼─────────────────┤
       │                                   │
       └────────────┬────────────────────┘
                    │
            ┌───────▼────────┐
            │  SFU (mediasoup)
            │  - Media routing
            │  - Bitrate control
            │  - RTC stats
            │  Port: 3000-3100
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │ WebSocket       │
            │ Signaling       │
            │ Express + Redis │
            │ Port: 3001      │
            └─────────────────┘
```

**Компоненты:**
- mediasoup (C++ SFU library)
- Redis (session management)
- Load balancer

**Масштабируемость:** 20-100 пользователей на сервер

### Phase 3: Chat & Auth (100+ пользователей)

```
┌───────────────────────────────────────────────┐
│              API Gateway / Load Balancer       │
│              (nginx / HAProxy)                 │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼────┐   ┌────▼────┐   ┌────▼────┐
│ Pod 1  │   │ Pod 2   │   │ Pod N   │
│ SFU +  │   │ SFU +   │   │ SFU +   │
│ Auth   │   │ Auth    │   │ Auth    │
└───┬────┘   └────┬────┘   └────┬────┘
    │             │             │
    └──────────┬──────────────┘
               │
        ┌──────▼──────┐
        │ PostgreSQL  │
        │ - Users     │
        │ - Rooms     │
        │ - Messages  │
        └─────────────┘
        
        ┌──────────────┐
        │ Redis Pub/Sub│
        │ - Sessions   │
        │ - Cache      │
        └──────────────┘
```

**Новые функции:**
- JWT authentication
- PostgreSQL database (users, rooms, messages)
- Real-time chat via WebSocket
- User profiles & friends list
- Room permissions

### Phase 4: Enterprise-scale (1000+ пользователей)

```
┌─────────────────────────────────────────────────────┐
│      CDN + Kubernetes Cluster (region-aware)        │
└─────────────────────────────────────────────────────┘
           │
    ┌──────┼──────┐
    │      │      │
┌───▼──┐ ┌─▼──┐ ┌─▼──┐
│ EU   │ │ US │ │ AS │
│ Zone │ │Zone│ │Zone│
└───┬──┘ └─┬──┘ └─┬──┘
    │      │     │
    └──────┼──────┘
           │
       ┌───▼────────────────┐
       │  Control Plane     │
       │  - Traffic routing │
       │  - Health checks   │
       │  - Auto-scaling    │
       └────────────────────┘
```

**Требования:**
- Kubernetes cluster с autoscaling
- Global load balancer
- Regional databases (read replicas)
- CDN для static assets
- Monitoring (Prometheus + Grafana)
- Logging (ELK Stack)
- Distributed tracing (Jaeger)

---

## Technology Comparison

| Компонент | MVP | Phase 2 | Phase 3 | Phase 4 |
|-----------|-----|---------|---------|---------|
| Media | WebRTC P2P | mediasoup | mediasoup | mediasoup |
| Signaling | Express WS | Express WS | Express + Redis | Express + Redis |
| Auth | None | JWT | JWT + DB | JWT + OAuth |
| Database | RAM | RAM | PostgreSQL | PostgreSQL + replicas |
| Cache | None | Redis | Redis | Redis cluster |
| Deployment | Docker | Docker | Docker K8s | K8s multi-region |
| Scaling | 3 peers | 100 peers | 10K users | 1M users |
| Cost | ~$10/mo | ~$50/mo | ~$500/mo | Custom |

---

## Implementation Milestones

### Milestone 1: MVP (Now ✅)
- [x] WebRTC P2P screen sharing
- [x] Quality selection (1080p, 1440p, 2160p)
- [x] Adaptive bitrate
- [x] WebSocket signaling
- [x] Docker setup

### Milestone 2: SFU (3-4 weeks)
- [ ] mediasoup integration
- [ ] Multiple simultaneous streams
- [ ] Bandwidth management
- [ ] Recording capability
- [ ] Redis session management

### Milestone 3: Full Features (6-8 weeks)
- [ ] User authentication (JWT)
- [ ] PostgreSQL integration
- [ ] Real-time chat
- [ ] User profiles
- [ ] Room management
- [ ] Push notifications

### Milestone 4: Enterprise (12+ weeks)
- [ ] Kubernetes deployment
- [ ] Multi-region support
- [ ] Advanced monitoring
- [ ] Load testing
- [ ] Security hardening
- [ ] SLA guarantees

---

## Performance Targets

| Metric | MVP | Phase 2 | Phase 3 | Phase 4 |
|--------|-----|---------|---------|---------|
| End-to-end latency | <500ms | <300ms | <300ms | <200ms |
| Max concurrent users | 3 | 100 | 10K | 1M |
| CPU per user | 5% | 1% | 0.1% | <0.01% |
| Memory per user | 20MB | 2MB | 1MB | 0.5MB |
| Availability | 95% | 99% | 99.5% | 99.99% |

---

## Cost Estimation

| Phase | Compute | Storage | Bandwidth | Total/month |
|-------|---------|---------|-----------|------------|
| MVP | $10 | $5 | $0 | $15 |
| Phase 2 | $50 | $20 | $30 | $100 |
| Phase 3 | $200 | $100 | $150 | $450 |
| Phase 4 | $2000 | $500 | $2000 | $4500 |

---

## Next Steps

1. **Immediate (Week 1):**
   - [ ] Test MVP with real users
   - [ ] Gather feedback on UX
   - [ ] Profile CPU/memory usage

2. **Short-term (Week 2-3):**
   - [ ] Implement mediasoup for SFU
   - [ ] Add TURN server support
   - [ ] Improve error handling

3. **Medium-term (Week 4-8):**
   - [ ] Add authentication layer
   - [ ] Integrate PostgreSQL
   - [ ] Build chat feature

4. **Long-term (Week 9+):**
   - [ ] Kubernetes deployment
   - [ ] Advanced monitoring
   - [ ] Enterprise features (recording, analytics)

---

## References

- [mediasoup Documentation](https://mediasoup.org)
- [WebRTC Best Practices](https://w3c.github.io/webrtc-pc/)
- [Next.js Production Checklist](https://nextjs.org/docs/going-to-production)
- [Kubernetes Scaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/)
