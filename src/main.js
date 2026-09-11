import './style.css'
import { Capacitor } from '@capacitor/core'
import { checkForUpdate, checkWebUpdate, installWebUpdate, installUpdate, getInstalledVersion, onDownloadProgress, exitApp } from './updater.js'
import { Activity, Ban, Bell, BookOpen, ChevronDown, Clock3, Flame, Heart, LayoutDashboard, Link, LogOut, Mail, MessageCircle, Plus, Radio, ScrollText, Search, Send, Settings, ShieldCheck, Skull, Sparkles, Store, Swords, Target, Trophy, UserRound, Users, Wifi, Zap, createIcons } from 'lucide'

// No app instalado (Android) não existe "localhost" do PC — precisa apontar para o servidor real.
const APP_DOMAIN = 'https://leetarena.tech'
const MEDIA_BASE_URL = Capacitor.isNativePlatform()
  ? `${APP_DOMAIN}/media`
  : (import.meta.env.VITE_MEDIA_URL || `${window.location.origin}/media`)
const storedAuthToken = localStorage.getItem('leet-auth-token') || ''
let storedUser = null
try { storedUser = JSON.parse(localStorage.getItem('leet-auth-user') || 'null') } catch { storedUser = null }
let videoManifest = {}

const characters = {
  cedric: {
    id: 'cedric', name: 'Cedric', title: 'O Predador', hp: 1300, accent: '#ff6b45',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 65 de dano. Ilimitado.', kind: 'damage', damage: 65 },
      { id: 'predatory', name: 'Ataque predatório', detail: 'Se sofrer ataque básico no próximo turno, ataca causando 160 de dano, e recupera 180 de HP. 3 usos.', kind: 'predatory', uses: 3 },
      { id: 'mark', name: 'Marcar alvo', detail: 'Aplica uma marca no oponente. Ao acertar 2 ataques básicos consecutivos e bem-sucedidos, ativa a marca, causando um dano extra de 270 de dano. 2 usos.', kind: 'mark', uses: 2 },
      { id: 'execute', name: 'Execução!', detail: 'Quando o oponente atinge 25% de HP restante, essa habilidade pode ser ativada, executando instantaneamente o alvo. 1 uso.', kind: 'execute', uses: 1 },
      { id: 'bindings', name: 'Amarras', detail: 'Retira o livre arbítrio do oponente, fazendo com que ele seja obrigado a realizar 2 ataques básicos seguidos em você, porém oferece 100 de Aumento de Dano ao ataque básico do oponente, nesses 2 turnos. 3 usos.', kind: 'bindings', uses: 3 },
    ],
  },
  voss: {
    id: 'voss', name: 'Voss', title: 'O Furioso', hp: 1200, accent: '#79d6c2',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 75 de dano. Ilimitado.', kind: 'damage', damage: 75 },
      { id: 'rage', name: 'Aumentar fúria', detail: 'Aumenta fúria em 10. Passa a aumentar a fúria em 20, após o 10º turno. Ilimitado.', kind: 'rage' },
      { id: 'impulse', name: 'Impulso', detail: 'Aumento o dano do ataque básico em +250 apenas no próximo turno. Custa 55 de fúria. Ilimitado.', kind: 'impulse' },
      { id: 'heal', name: 'Cura', detail: 'Recupera 250 de HP, custa 30 de fúria. Ilimitado.', kind: 'heal' },
      { id: 'denial', name: 'Negação', detail: 'Bloqueia o oponente de usar 1 habilidade ativa por 2 turnos. Custo: 25 de fúria.', kind: 'deny' },
    ],
  },
  damon: {
    id: 'damon', name: 'Damon', title: 'O Rei Caído', hp: 1600, accent: '#b58cff',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 60 de dano. Ilimitado.', kind: 'damage', damage: 60 },
      { id: 'sacrifice', name: 'Sacrifício', detail: 'Consome 200 de HP e ganha 200 de dano no próximo ataque básico. Não acumula. Ilimitado.', kind: 'sacrifice' },
      { id: 'resurrect', name: 'Ressuscitar', detail: 'Após receber 5 ataques básicos, escapa de 1 ataque fatal, recupera 500 HP e ganha +60 no ataque básico. 1 uso.', kind: 'resurrect', uses: 1 },
      { id: 'pain-hunger', name: 'Fome de dor', detail: 'Obriga o oponente a usar ataque básico no próximo turno e concede +70 de dano a ele nesse turno. Ilimitado.', kind: 'taunt' },
      { id: 'broken-limit', name: 'Limite Rompido', detail: 'Causa 45% de todo dano recebido nos últimos 11 turnos. Após o 11º turno. 1 uso.', kind: 'broken-limit', uses: 1 },
      { id: 'resistance', name: 'Resistência', detail: 'A cada 200 HP perdidos, reduz permanentemente em 5 o dano de ataques básicos recebidos. Ilimitado.', kind: 'resistance' },
    ],
  },
  kyn: {
    id: 'kyn', name: 'Kyn', title: 'O Devedor', hp: 1250, accent: '#e7b65c',
    abilities: [
      { id: 'basic', name: 'Dreno', detail: 'Ataque básico do Kyn. Por padrão causa 0 de dano; se Premonição acertar, causa 125 no próximo uso e recupera 75% desse bônus.', kind: 'damage', damage: 0 },
      { id: 'foresight', name: 'Premonição', detail: 'Escolha a ação que o oponente usará. Se acertar, o próximo Dreno ganha 125 de dano. Não acumula.', kind: 'foresight' },
      { id: 'harvest', name: 'Colheita', detail: 'Registra por 4 turnos toda cura recebida pelo oponente e converte o total em Dreno. 1 uso.', kind: 'harvest', uses: 1 },
      { id: 'second-life', name: 'Sobrevida', detail: 'Sobrevive com 1 HP ao próximo dano fatal e ganha 200 de dano em Dreno. 1 uso.', kind: 'second-life', uses: 1 },
      { id: 'patience', name: 'Paciência', detail: 'Passiva. Após 3 turnos sem receber ataque básico, ganha 100 de dano em Dreno.', kind: 'patience' },
      { id: 'tribute', name: 'Tributo', detail: 'Passiva. Após 3 turnos sem adquirir dano em Dreno, ganha 200 de dano em Dreno e perde 150 HP.', kind: 'tribute' },
    ],
  },
  nox: {
    id: 'nox', name: 'Nox', title: 'A Máquina', hp: 1400, accent: '#67b9ff',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 80 de dano. Ilimitado.', kind: 'damage', damage: 80 },
      { id: 'marked', name: 'Marcado', detail: 'Aplica uma marca no alvo. Ao atingir 10 marcas, precisa usar Acionador para marcar novamente. Ilimitado.', kind: 'nox-mark' },
      { id: 'trigger', name: 'Acionador', detail: 'Explode as marcas do alvo. Cada marca causa 60 de dano. Ilimitado.', kind: 'nox-trigger' },
      { id: 'pressure', name: 'Pressão', detail: 'Consome 1 carga para escolher uma habilidade do oponente e bloqueá-la por 1 turno.', kind: 'nox-pressure' },
      { id: 'reconstruction', name: 'Reconstrução', detail: 'Com 8 marcas no alvo, recebe também toda cura que ele receber.', kind: 'nox-reconstruction' },
      { id: 'progression', name: 'Progressão', detail: 'Passiva. Adiciona 1 marca no alvo a cada 5 turnos, respeitando o limite de 10 marcas.', kind: 'nox-progression' },
    ],
  },
  brick: {
    id: 'brick', name: 'Brick', title: 'O Implacável', hp: 1450, accent: '#d87954',
    abilities: [
      { id: 'basic', name: 'Ataque básico (Soco)', detail: 'Causa 25 de dano. Ilimitado.', kind: 'damage', damage: 25, damageType: 'punch' },
      { id: 'direct', name: 'Chute', detail: 'Causa 35 de dano. 3 usos.', kind: 'damage', damage: 35, uses: 3, damageType: 'kick' },
      { id: 'counter', name: 'Contra-Golpe', detail: 'Ao receber ataque básico, tem 50% de chance de executar um Soco adicional.', kind: 'counter' },
      { id: 'retaliation', name: 'Retaliação', detail: 'Com 2 esquivas, 2 Chutes e 6 Socos recebidos, causa 700 de dano e reseta as skills. Ilimitado.', kind: 'retaliation' },
      { id: 'dodge', name: 'Esquiva', detail: 'Se receber ataque básico no próximo turno, evita o dano. 4 usos.', kind: 'dodge', uses: 4 },
      { id: 'provoke', name: 'Provocar', detail: 'Obriga o oponente a usar ataque básico no próximo turno e concede +150 de dano a ele. Ilimitado.', kind: 'taunt', tauntBonus: 150 },
    ],
  },
  zero: {
    id: 'zero', name: 'Zero', title: 'O Analista', hp: 1500, accent: '#c9d8e8',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa dano conforme a Evolução. Se o oponente usar ataque básico ao mesmo tempo, Sou o melhor! anula esse ataque e Zero ganha 30 de experiência.', kind: 'damage', damage: 45 },
      { id: 'analysis', name: 'Análise', detail: 'Se acertar a próxima habilidade do oponente, ganha 30 de experiência. Não analisa ataques básicos.', kind: 'analysis' },
      { id: 'evolution', name: 'Evolução', detail: 'Passiva. A experiência aumenta o dano básico: Nv.1 45, Nv.2 75, Nv.3 120, Nv.4 170, Nv.5 265.', kind: 'zero-evolution' },
      { id: 'survival', name: 'Modo sobrevivência', detail: 'Passiva. Quando o oponente tem mais HP, ganha 20% de roubo de vida no ataque básico.', kind: 'zero-survival' },
    ],
  },
  haku: {
    id: 'haku', name: 'Haku', title: 'A Dançarina da Lâmina', hp: 1350, accent: '#a8d8ff',
    abilities: [
      { id: 'basic', name: 'Ataque básico - Afiar', detail: 'Causa 30, 60, 90, 120 e 150 de dano. O dano reinicia após 150.', kind: 'damage', damage: 30 },
      { id: 'defensive-stance', name: 'Postura Defensiva', detail: 'Durante 3 turnos recebe 55% menos dano, mas não pode usar ataques básicos. 2 usos.', kind: 'haku-defense', uses: 2 },
      { id: 'blade-dance', name: 'Dança da lâmina', detail: 'Se o oponente usar ataque básico no próximo turno, desfere 2 ataques básicos imediatamente. Ilimitado.', kind: 'haku-dance' },
      { id: 'deep-cut', name: 'Corte Profundo', detail: 'Durante 5 turnos, toda cura recebida pelo oponente é reduzida em 50%. 1 uso.', kind: 'haku-deep-cut', uses: 1 },
      { id: 'last-dance', name: 'Última Dança', detail: 'Passiva. Abaixo de 55% de HP, os ataques básicos ressoam e realizam dois ataques no mesmo turno.', kind: 'haku-last-dance' },
      { id: 'concentration', name: 'Concentração', detail: 'Passiva. Ao pular um turno, recupera 50 de HP.', kind: 'haku-concentration' },
    ],
  },
  ogro: {
    id: 'ogro', name: 'Ogro', title: 'O Devorador', hp: 1700, accent: '#8fae5c',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 35 de dano. Ilimitado.', kind: 'damage', damage: 35 },
      { id: 'grab', name: 'Pego pelo Pescoço', detail: 'Prende o oponente por até 5 turnos. Enquanto preso, você só pode usar Apertar ou Soltar, e o oponente só pode usar 1 habilidade sorteada aleatoriamente por turno. 1 uso.', kind: 'ogro-grab', uses: 1 },
      { id: 'squeeze', name: 'Apertar', detail: 'Causa 50 de dano enquanto o oponente está preso.', kind: 'ogro-squeeze' },
      { id: 'release', name: 'Soltar', detail: 'Encerra o agarrão imediatamente.', kind: 'ogro-release' },
      { id: 'kick', name: 'Chutar', detail: 'Chuta o oponente para fora da arena, impedindo-o de jogar por 1 turno. 1 uso.', kind: 'ogro-kick', uses: 1 },
      { id: 'roar', name: 'Rugido', detail: 'Recebe 30% de redução de dano durante os próximos 2 turnos. 1 uso.', kind: 'ogro-roar', uses: 1 },
      { id: 'throw', name: 'Jogar para o Alto', detail: 'No próximo turno, a habilidade que o oponente poderá usar será escolhida aleatoriamente. 1 uso.', kind: 'ogro-throw', uses: 1 },
    ],
  },
  kiro: {
    id: 'kiro', name: 'Kiro', title: 'O Guardião', hp: 1400, accent: '#8bc6b0',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 60 de dano. Ilimitado.', kind: 'damage', damage: 60 },
      { id: 'damage-reduction', name: 'Redução de dano', detail: 'Reduz 30% de qualquer dano recebido por 2 turnos. 2 usos.', kind: 'kiro-reduction', uses: 2 },
      { id: 'strengthen', name: 'Fortalecer', detail: 'O próximo ataque básico causa 100 de dano. Pode acumular. 3 usos.', kind: 'kiro-strengthen', uses: 3 },
      { id: 'disrupt', name: 'Atrapalhar', detail: 'Força o oponente a pular o próximo turno. 2 usos.', kind: 'kiro-disrupt', uses: 2 },
      { id: 'double-attack', name: 'Ataque duplo', detail: 'Duplica o próximo ataque básico. 2 usos.', kind: 'kiro-double', uses: 2 },
      { id: 'luck', name: 'Sorte', detail: 'Passiva. Há 30% de chance de causar 100 de dano adicional ao realizar ataques básicos.', kind: 'kiro-luck' },
    ],
  },
  sany: {
    id: 'sany', name: 'Sany', title: 'A Afortunada', hp: 1350, accent: '#f4ba68',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: 'Causa 45 de dano. Ilimitado.', kind: 'damage', damage: 45 },
      { id: 'lucky-attack', name: 'Ataque de sorte', detail: 'Causa entre 200 e 650 de dano. Ganha 1 uso a cada 7 turnos.', kind: 'sany-lucky', uses: 1 },
      { id: 'courage', name: 'Coragem', detail: 'Passiva. Quando o oponente tem mais HP, causa +80 no ataque básico.', kind: 'sany-courage' },
      { id: 'amplification', name: 'Amplificação', detail: 'No próximo turno, aumenta em 25% o dano do ataque básico ou Ataque de sorte. 4 usos.', kind: 'sany-amplify', uses: 4 },
      { id: 'last-chance', name: 'Última chance', detail: 'Passiva. Uma vez por partida, sobrevive com 1 HP ao golpe fatal e ganha 1 uso de Ataque de sorte.', kind: 'sany-last-chance' },
      { id: 'research', name: 'Pesquisa', detail: 'Se acertar a habilidade que o oponente usará no próximo turno, ganha 1 uso de Ataque de sorte. 3 usos.', kind: 'sany-research', uses: 3 },
    ],
  },
}

const state = {
  screen: storedAuthToken ? (storedUser?.role === 'admin' ? 'dashboard' : 'home') : 'auth', players: [], turn: 1, phase: 'p1', selections: {}, log: [], result: '', animation: null,
  online: false, socket: null, roomFeedSocket: null, roomCode: '', createdRoomCode: '', playerIndex: 0, onlineWaiting: false, onlineError: '', publicRooms: [], onlinePlayerNames: [],
  homeMode: '', musicEnabled: false, roomFeedConnecting: false, roomFeedConnected: false, showSurrenderModal: false, actionNotice: '',
  lastTurnActions: [{ player: '', text: 'Aguardando escolhas' }, { player: '', text: 'Aguardando escolhas' }], hpDeltas: [null, null],
  updateAvailable: false, updateManifest: null, updateStatus: '', updateError: '', updateInstalling: false, updateProgress: 0, updateDownloaded: 0, updateTotal: 0, appVersionName: '',
  adminTab: 'upload', adminUpload: { character: 'cedric', ability: 'basic', file: null, status: '' },
  adminIdle: { character: 'cedric', file: null, status: '' }, adminIcon: { character: 'cedric', file: null, status: '' },
  authToken: storedAuthToken, currentUser: storedUser, authMode: 'login', authError: '', authLoading: false,
  battleLoading: false, battleLoadProgress: 0, battleLoadTotal: 0, battleLoadStatus: '', characterChoice: null, characterOpponentChosen: false, characterTimeLeft: 45, characterTimerId: null,
  dashboardTab: 'overview', dashboardRange: 'daily', dashboardFilter: 'all', dashboardQuery: '', dashboardNotice: '', dashboardSearchOpen: false,
  setupOpen: false, profileOpen: false, profileDraft: '', leaderboardOpen: false, comingSoonOpen: false, comingSoonLabel: '',
  denyPickerOpen: false, denyTargetAbilityId: '', foresightPickerOpen: false, pressurePickerOpen: false, modeDrawerEntering: false, codexOpen: false, codexCharacter: 'cedric', mailboxOpen: false, adminMail: { subject: '', body: '', status: '' }, chatOpen: false, chatTab: 'general', generalChatMessages: [], privateChatMessages: [], chatDraft: '',
  videoQueue: [], videoPlaying: false, turnTimeLeft: 40, turnTimerId: null, loadingTipIndex: 0, loadingTipTimerId: null,
}

const app = document.querySelector('#app')

function render() {
  if ((state.screen === 'dashboard' || state.screen === 'admin') && state.currentUser?.role !== 'admin') state.screen = state.authToken ? 'home' : 'auth'
  document.body.className = state.screen === 'battle' ? 'battle-view' : 'home-view'
  if (state.screen !== 'battle') stopTurnTimer()
  if (state.screen === 'loading') startLoadingTipTimer()
  else stopLoadingTipTimer()
  app.innerHTML = state.screen === 'auth' ? renderAccountAccess() : state.screen === 'home' ? renderGameHome() : state.screen === 'dashboard' ? renderDashboard() : state.screen === 'loading' ? renderBattleLoading() : state.screen === 'character-select' ? renderCharacterSelect() : state.screen === 'lobby' ? renderLobby() : state.screen === 'admin' ? renderAdmin() : renderBattle()
  createIcons({ icons: { Activity, Ban, Bell, BookOpen, ChevronDown, Clock3, Flame, Heart, LayoutDashboard, Link, LogOut, Mail, MessageCircle, Plus, Radio, ScrollText, Search, Send, Settings, ShieldCheck, Skull, Sparkles, Store, Swords, Target, Trophy, UserRound, Users, Wifi, Zap } })
  bindEvents()
  if (state.screen === 'battle') { mountVideoCard(); updateStatusPanels() }
  if ((state.screen === 'home' || state.screen === 'dashboard') && state.homeMode === 'online' && !state.roomFeedConnected && !state.roomFeedConnecting && !state.roomFeedSocket) connectOnline('list')
}

function renderLobby() {
  return `<section class="home-shell lobby-shell"><div class="brand-mark"><span>LA</span><small>LEET ARENA</small></div><div class="home-copy"><p class="eyebrow">SALA ONLINE</p><h1>AGUARDANDO</h1><p class="intro">Você está na fila. A partida começa automaticamente quando outro jogador entrar.</p></div><div class="setup-panel"><p class="online-wait">● CONEXÃO ATIVA<br><small>Aguardando o segundo jogador.</small></p><button class="primary-button" data-action="cancel-online">SAIR DA SALA <span>↗</span></button></div></section>`
}

const loadingTips = [
  'Você sabia que o Leet Arena é um jogo onde vence quem mais conhece todos os personagens?',
  'Damon e Haku são inimigos mortais!',
  'Brick é imune ao teu ego.',
  'Damon foi um rei... um grande rei.',
]

function getPlayerRankPosition() {
  const entries = getLeaderboardEntries()
  const index = entries.findIndex((entry) => entry.isYou)
  return index >= 0 ? index + 1 : entries.length
}

function loadingFighterCard(player, index) {
  const character = player?.character
  if (!character) return '<div class="load-fighter empty"></div>'
  const icon = videoManifest[character.id]?.icon
  const label = state.online ? (state.onlinePlayerNames?.[index] || `JOGADOR ${index + 1}`) : `JOGADOR ${index + 1}`
  return `<div class="load-fighter" style="--accent:${character.accent}">
    <div class="load-fighter-art">${icon ? `<img src="${MEDIA_BASE_URL}${icon}" alt="${character.name}">` : `<span>${character.name.slice(0, 2).toUpperCase()}</span>`}</div>
    <strong>${escapeHtml(character.name)}</strong>
    <small>${escapeHtml(label)}</small>
  </div>`
}

function renderBattleLoading() {
  const progress = Math.round(state.battleLoadProgress)
  const tip = loadingTips[state.loadingTipIndex % loadingTips.length]
  const username = state.currentUser?.username || 'Jogador'
  const rank = getPlayerRank(username)
  const [p1, p2] = state.players
  return `<section class="battle-loading">
    <span class="load-brand">LEET ARENA</span>
    <div class="battle-loading-inner">
      <div class="load-versus">
        ${loadingFighterCard(p1, 0)}
        <div class="load-vs"><i data-lucide="Swords"></i><span>VS</span></div>
        ${loadingFighterCard(p2, 1)}
      </div>
      <div class="load-player-line">
        <span class="load-rank-pos">#${getPlayerRankPosition()}</span>
        <div class="load-player-copy"><strong>${escapeHtml(getPlayerNickname(username))}</strong><small>${rank.winRate}% de aproveitamento</small></div>
        <span class="load-rank-tier" style="--rank-color:${rank.color}">${escapeHtml(rank.label)}</span>
      </div>
      <div class="battle-progress"><i style="width:${progress}%"></i></div>
      <strong>${progress}%</strong>
      <p class="battle-loading-status">${state.battleLoadStatus || 'Carregando personagens e habilidades...'}</p>
      <div class="battle-loading-tip-row" data-action="next-tip"><button class="tip-arrow" data-action="prev-tip" type="button">&lt;</button><p class="battle-loading-tip">${escapeHtml(tip)}</p><button class="tip-arrow" data-action="next-tip" type="button">&gt;</button></div>
    </div>
  </section>`
}

function startLoadingTipTimer() {
  if (state.loadingTipTimerId) return
  state.loadingTipTimerId = setInterval(() => {
    state.loadingTipIndex = (state.loadingTipIndex + 1) % loadingTips.length
    if (state.screen === 'loading') render()
  }, 4000)
}

function stopLoadingTipTimer() {
  if (!state.loadingTipTimerId) return
  clearInterval(state.loadingTipTimerId)
  state.loadingTipTimerId = null
}

function shiftLoadingTip(step) {
  state.loadingTipIndex = (state.loadingTipIndex + step + loadingTips.length) % loadingTips.length
  stopLoadingTipTimer()
  startLoadingTipTimer()
  render()
}

function renderCharacterSelect() {
  return `<section class="character-select-screen"><div class="character-select-panel"><p class="eyebrow">A SALA ESTÁ COMPLETA</p><h1>ESCOLHA SEU PERSONAGEM</h1><p class="character-select-copy">A escolha é secreta. O oponente verá apenas quando a partida começar.</p><div class="character-select-timer">${Math.max(0, state.characterTimeLeft)}s</div><div class="character-choice-grid">${Object.values(characters).map((character) => { const icon = videoManifest[character.id]?.icon; return `<button class="character-choice ${state.characterChoice === character.id ? 'selected' : ''}" data-character-choice="${character.id}">${icon ? `<img class="character-choice-icon" src="${MEDIA_BASE_URL}${icon}" alt="${character.name}">` : '<span class="character-choice-placeholder">' + character.name.slice(0, 2).toUpperCase() + '</span>'}<strong>${character.name}</strong><small>${character.title}</small></button>` }).join('')}</div><p class="character-select-status">${state.characterChoice ? (state.characterOpponentChosen ? 'Oponente escolheu. Aguardando resolução...' : 'Escolha registrada. Aguardando o oponente...') : 'Escolha um personagem para continuar.'}</p></div></section>`
}

const adminTabs = [{ id: 'upload', label: 'UPLOAD DE VÍDEOS' }]

function renderAdmin() {
  return `<section class="admin-shell">
    <header class="admin-header">
      <div class="brand-mark"><span>LA</span><small>LEET ARENA / ADMIN</small></div>
      <button class="primary-button small secondary" data-action="admin-back">PAINEL</button>
    </header>
    <nav class="admin-tabs">${adminTabs.map((tab) => `<button class="admin-tab ${state.adminTab === tab.id ? 'active' : ''}" data-admin-tab="${tab.id}">${tab.label}</button>`).join('')}</nav>
    <div class="admin-content">${state.adminTab === 'upload' ? renderAdminUploadTab() : ''}</div>
  </section>`
}

function renderAccountAccess() {
  const isRegister = state.authMode === 'register'
  return `<section class="admin-login-shell">
    <form class="admin-login-panel" data-auth-form>
      <div class="ops-brand"><span>LA</span><div><strong>LEET ARENA</strong><small>Conta da arena</small></div></div>
      <div class="auth-switch"><button type="button" class="${!isRegister ? 'active' : ''}" data-auth-mode="login">ENTRAR</button><button type="button" class="${isRegister ? 'active' : ''}" data-auth-mode="register">CRIAR CONTA</button></div>
      <div class="admin-login-copy"><p>${isRegister ? 'NOVO COMPETIDOR' : 'ACESSO À ARENA'}</p><h1>${isRegister ? 'Criar sua conta' : 'Bem-vindo de volta'}</h1><span>${isRegister ? 'Cadastre-se para entrar nas partidas e acompanhar seu progresso.' : 'Administradores são direcionados automaticamente ao painel de controle.'}</span></div>
      <label class="admin-login-field"><span>USUÁRIO</span><input type="text" data-auth-username autocomplete="username" minlength="3" maxlength="24" required></label>
      <label class="admin-login-field"><span>SENHA</span><input type="password" data-auth-password autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="${isRegister ? 8 : 1}" required></label>
      <button class="admin-login-submit" type="submit" ${state.authLoading ? 'disabled' : ''}>${state.authLoading ? 'AUTENTICANDO...' : isRegister ? 'CRIAR CONTA' : 'ENTRAR'}</button>
      <p class="admin-login-error">${state.authError}</p>
    </form>
  </section>`
}

function renderAdminUploadTab() {
  const upload = state.adminUpload
  const character = characters[upload.character] ?? characters.cedric
  const idleCharacter = characters[state.adminIdle.character] ?? characters.cedric
  const iconCharacter = characters[state.adminIcon.character] ?? characters.cedric
  const existing = videoManifest[upload.character] ?? {}
  const idleExisting = videoManifest[state.adminIdle.character] ?? {}
  const iconExisting = videoManifest[state.adminIcon.character] ?? {}
  return `<div class="admin-upload">
    <section class="admin-idle admin-idle-feature">
      <div class="admin-idle-heading"><div><p class="panel-label">CENÁRIO BASE DO PERSONAGEM</p><h2>Imagem fixa entre os turnos</h2><small>Essa imagem aparece no turno 0 e volta assim que os vídeos terminam.</small></div><span class="idle-badge">IMAGEM</span></div>
      <label class="admin-field"><span>PERSONAGEM DA IMAGEM</span>
        <select data-admin-idle-character>${Object.values(characters).map((item) => `<option value="${item.id}" ${item.id === state.adminIdle.character ? 'selected' : ''}>${item.name}</option>`).join('')}</select>
      </label>
      <label class="admin-field"><span>ESCOLHER IMAGEM (.png, .jpg ou .webp)</span><input type="file" accept="image/png,image/jpeg,image/webp" data-admin-idle-file /></label>
      <button class="primary-button small" data-action="admin-upload-idle">ENVIAR IMAGEM BASE</button>
      <p class="admin-status">${state.adminIdle.status}</p>
    </section>
    <section class="admin-idle admin-idle-feature">
      <div class="admin-idle-heading"><div><p class="panel-label">ÍCONE DO PERSONAGEM</p><h2>Miniatura de seleção</h2><small>Este ícone aparece na tela de escolha do personagem e no avatar do perfil.</small></div><span class="idle-badge">ÍCONE</span></div>
      <label class="admin-field"><span>PERSONAGEM DO ÍCONE</span>
        <select data-admin-icon-character>${Object.values(characters).map((item) => `<option value="${item.id}" ${item.id === state.adminIcon.character ? 'selected' : ''}>${item.name}</option>`).join('')}</select>
      </label>
      <label class="admin-field"><span>ESCOLHER ÍCONE (.png, .jpg ou .webp)</span><input type="file" accept="image/png,image/jpeg,image/webp" data-admin-icon-file /></label>
      <button class="primary-button small" data-action="admin-upload-icon">ENVIAR ÍCONE</button>
      <p class="admin-status">${state.adminIcon.status}</p>
    </section>
    <section class="admin-idle admin-idle-feature admin-video-panel">
      <div class="admin-idle-heading"><div><p class="panel-label">ENVIAR VÍDEO DE HABILIDADE</p><h2>Habilidades e animações</h2><small>Os vídeos ficam separados por personagem e efeito, sem pré-visualização no painel.</small></div><span class="idle-badge">VÍDEO</span></div>
      <label class="admin-field"><span>PERSONAGEM</span>
        <select data-admin-character>${Object.values(characters).map((item) => `<option value="${item.id}" ${item.id === upload.character ? 'selected' : ''}>${item.name}</option>`).join('')}</select>
      </label>
      <label class="admin-field"><span>HABILIDADE</span>
        <select data-admin-ability>${character.abilities.map((ability) => `<option value="${ability.id}" ${ability.id === upload.ability ? 'selected' : ''}>${ability.name}${existing[ability.id] ? ' ✓' : ''}</option>`).join('')}</select>
      </label>
      <label class="admin-field"><span>ARQUIVO DE VÍDEO (.mp4)</span>
        <input type="file" accept="video/mp4,video/webm" data-admin-file />
      </label>
      <button class="primary-button small" data-action="admin-upload">ENVIAR VÍDEO</button>
      <p class="admin-status">${upload.status}</p>
      <div class="admin-video-list">
        <p class="panel-label">VÍDEOS JÁ ENVIADOS — ${character.name.toUpperCase()}</p>
        ${character.abilities.map((ability) => `<div class="admin-video-row"><span>${ability.name}</span><strong>${existing[ability.id] ? 'ENVIADO' : 'PENDENTE'}</strong></div>`).join('')}
      </div>
    </section>
  </div>`
}

function renderGameHome() {
  const isOnlineMode = state.homeMode === 'online'
  const isBattle2v2Mode = state.homeMode === 'battle2v2'
  const isOfflineMode = state.homeMode === 'offline'
  const isTournamentMode = state.homeMode === 'tournament'
  const modeTitle = isOnlineMode ? 'DUELO' : isBattle2v2Mode ? 'BATALHA 2X2' : isTournamentMode ? 'TORNEIOS' : 'MODO TESTE'
  const modeOpen = isOnlineMode || isBattle2v2Mode || isOfflineMode || isTournamentMode
  const entering = modeOpen && state.modeDrawerEntering
  state.modeDrawerEntering = false
  return `<section class="home-shell home-hero rpg-home">
    ${renderUpdateBanner()}
    ${renderGameSetupMenu()}
    ${state.profileOpen ? renderProfileModal() : ''}
    <span class="version-tag">${state.appVersionName ? `v${state.appVersionName}` : ''}</span>
    <div class="setup-panel home-setup rpg-play-panel">
      <div class="home-copy home-welcome">
        <p class="intro welcome-line">Bem-vindo(a) ao <span>Leet Arena</span></p>
        <p class="intro choose-mode">Escolha o modo:</p>
      </div>
      <div class="mode-selector rpg-mode-selector"><button class="primary-button ${isOnlineMode ? 'active' : ''}" data-action="show-online-mode">DUELO</button><button class="primary-button secondary ${isOfflineMode ? 'active' : ''}" data-action="show-offline-mode">MODO TESTE</button><button class="primary-button secondary ${isBattle2v2Mode ? 'active' : ''}" data-action="show-battle2v2-mode">BATALHA 2X2</button><button class="primary-button secondary ${isTournamentMode ? 'active' : ''}" data-action="show-tournament-mode">TORNEIOS</button></div>
    </div>
    ${modeOpen ? `<div class="mode-drawer-backdrop ${entering ? 'is-entering' : ''}" data-action="close-mode-drawer"></div>
    <aside class="mode-drawer ${entering ? 'is-entering' : ''}" role="dialog" aria-label="${modeTitle}">
      <header class="mode-drawer-head"><button class="mode-drawer-back" data-action="close-mode-drawer" title="Voltar">←</button><strong>${modeTitle}</strong></header>
      <div class="mode-drawer-body">${isOnlineMode ? renderOnlinePanel() : isBattle2v2Mode ? renderBattle2v2Panel() : isTournamentMode ? renderTournamentPanel() : renderOfflinePanel()}</div>
    </aside>` : ''}
  </section>`
}

function renderGameSetupMenu() {
  const username = state.currentUser?.username || 'Jogador'
  const nickname = getPlayerNickname(username)
  const initials = getPlayerInitials(nickname, username)
  const avatar = getPlayerAvatar()
  const rank = getPlayerRank(username)
  const unread = getUnreadMailCount()
  return `<div class="identity-corner">
    <div class="identity-item identity-stack">
      <button class="profile-avatar-corner" type="button" data-action="open-profile" title="Perfil do jogador"><span class="account-rune">${avatar ? `<img src="${avatar}" alt="Avatar de ${escapeHtml(nickname)}">` : initials}</span></button>
      <small>Perfil</small>
      <button class="rank-badge shop-badge" type="button" data-action="open-coming-soon" data-coming-soon="Loja" title="Loja"><i data-lucide="Store"></i></button>
      <small>Loja</small>
      <button class="rank-badge chat-badge" type="button" data-action="open-chat" title="Chat geral"><i data-lucide="MessageCircle"></i></button>
      <small>Chat</small>
    </div>
    <div class="identity-item"><button class="rank-badge" type="button" data-action="open-leaderboard" style="--rank-color:${rank.color}" title="${escapeHtml(rank.tooltip)}"><i data-lucide="Trophy"></i>${rank.shortLabel ? `<span>${rank.shortLabel}</span>` : ''}</button><small>Ranking</small></div>
    <div class="identity-item"><button class="rank-badge" type="button" data-action="open-coming-soon" data-coming-soon="Eventos" title="Eventos"><i data-lucide="Radio"></i></button><small>Eventos</small></div>
    <div class="identity-item"><button class="rank-badge" type="button" data-action="open-coming-soon" data-coming-soon="Torneios" title="Torneios"><i data-lucide="Swords"></i></button><small>Torneios</small></div>
    <div class="identity-item"><button class="rank-badge" type="button" data-action="open-codex" title="Livro dos personagens"><i data-lucide="BookOpen"></i></button><small>Livro</small></div>
    <div class="identity-item"><button class="rank-badge" type="button" data-action="open-mailbox" title="Correio"><i data-lucide="Mail"></i>${unread ? '<b class="mail-dot"></b>' : ''}</button><small>Correio</small></div>
  </div>
  <div class="setup-corner"><button class="setup-gear" data-action="toggle-setup" title="Setup do jogo"><i data-lucide="Settings"></i></button>${state.setupOpen ? `<div class="setup-popover"><button data-action="check-update"><i data-lucide="Activity"></i><span>Verificar atualização</span></button>${state.currentUser?.role === 'admin' ? '<button data-action="open-admin"><i data-lucide="LayoutDashboard"></i><span>Painel de controle</span></button>' : ''}<button data-action="account-logout"><i data-lucide="LogOut"></i><span>Sair da conta</span></button>${state.updateError ? `<small>${state.updateError}</small>` : ''}</div>` : ''}</div>
  ${state.leaderboardOpen ? renderLeaderboardModal() : ''}
  ${state.comingSoonOpen ? renderComingSoonModal() : ''}
  ${state.codexOpen ? renderCodexModal() : ''}
  ${state.mailboxOpen ? renderMailboxModal() : ''}
  ${state.chatOpen ? renderChatModal() : ''}`
}

function renderChatMessages(messages) {
  return messages.length ? messages.map((message) => `<p class="chat-message"><strong>${escapeHtml(message.name)}</strong><span>${escapeHtml(message.text)}</span></p>`).join('') : '<p class="profile-avatar-empty">Nenhuma mensagem ainda.</p>'
}

function renderChatModal() {
  const privateAvailable = state.screen === 'battle' && state.online && !state.result
  const tab = privateAvailable ? state.chatTab : 'general'
  const messages = tab === 'private' ? state.privateChatMessages : state.generalChatMessages
  const socket = tab === 'private' ? state.socket : state.roomFeedSocket
  const connected = socket?.readyState === globalThis.WebSocket?.OPEN
  return `<div class="profile-overlay" data-action="close-chat-backdrop">
    <div class="profile-panel chat-panel" role="dialog" aria-modal="true" aria-label="Chat">
      <button class="profile-close" data-action="close-chat" title="Fechar">✕</button>
      <div class="profile-header"><span class="profile-avatar"><i data-lucide="MessageCircle"></i></span><div><p>CHAT DA ARENA</p><h2>${tab === 'private' ? 'Partida privada' : 'Chat geral'}</h2></div></div>
      <div class="chat-tabs"><button class="${tab === 'general' ? 'active' : ''}" data-chat-tab="general">Geral</button>${privateAvailable ? `<button class="${tab === 'private' ? 'active' : ''}" data-chat-tab="private">Partida</button>` : ''}</div>
      <div class="chat-messages">${renderChatMessages(messages)}</div>
      ${connected ? '' : '<p class="chat-offline">Conectando ao servidor do chat...</p>'}
      <form class="chat-form" data-chat-form><input data-chat-input maxlength="300" value="${escapeHtml(state.chatDraft)}" placeholder="Escreva uma mensagem" autocomplete="off"><button type="submit" title="Enviar"><i data-lucide="Send"></i></button></form>
    </div>
  </div>`
}

function getMailbox() {
  try {
    const list = JSON.parse(localStorage.getItem('leet-mailbox') || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function saveMailbox(list) {
  localStorage.setItem('leet-mailbox', JSON.stringify(list.slice(0, 50)))
}

function getUnreadMailCount() {
  return getMailbox().filter((mail) => !mail.read).length
}

function sendAdminMail(subject, body) {
  const list = getMailbox()
  list.unshift({ id: `${Date.now()}`, subject, body, sentAt: new Date().toISOString(), read: false })
  saveMailbox(list)
}

function renderMailboxModal() {
  const mails = getMailbox()
  return `<div class="profile-overlay" data-action="close-mailbox-backdrop">
    <div class="profile-panel codex-panel" role="dialog" aria-modal="true" aria-label="Correio">
      <button class="profile-close" data-action="close-mailbox" title="Fechar">✕</button>
      <div class="profile-header">
        <span class="profile-avatar"><i data-lucide="Mail"></i></span>
        <div><p>CORREIO</p><h2>Mensagens</h2></div>
      </div>
      <div class="codex-list">
        ${mails.length ? mails.map((mail) => `<div class="mail-entry ${mail.read ? '' : 'unread'}">
          <div class="mail-head"><strong>${escapeHtml(mail.subject)}</strong><small>${new Date(mail.sentAt).toLocaleString('pt-BR')}</small></div>
          <p>${escapeHtml(mail.body)}</p>
        </div>`).join('') : '<p class="profile-avatar-empty">Nenhuma mensagem recebida.</p>'}
      </div>
    </div>
  </div>`
}

function renderCodexModal() {
  return `<div class="profile-overlay" data-action="close-codex-backdrop">
    <div class="profile-panel codex-panel" role="dialog" aria-modal="true" aria-label="Livro dos personagens">
      <button class="profile-close" data-action="close-codex" title="Fechar">✕</button>
      <div class="profile-header">
        <span class="profile-avatar"><i data-lucide="BookOpen"></i></span>
        <div>
          <p>LIVRO DOS PERSONAGENS</p>
          <h2>Habilidades</h2>
        </div>
      </div>
      <div class="codex-list">
        ${Object.values(characters).map((character) => {
          const icon = videoManifest[character.id]?.icon
          const open = state.codexCharacter === character.id
          return `<div class="codex-entry ${open ? 'open' : ''}">
            <button class="codex-tab" data-codex-character="${character.id}">
              <span class="codex-avatar">${icon ? `<img src="${MEDIA_BASE_URL}${icon}" alt="${character.name}">` : character.name.slice(0, 2).toUpperCase()}</span>
              <span class="codex-tab-copy"><strong>${character.name}</strong><small>${character.title} · ${character.hp} HP</small></span>
              <span class="codex-arrow">${open ? '−' : '+'}</span>
            </button>
            <div class="codex-drawer" ${open ? '' : 'hidden'}>${character.abilities.map((ability) => `<article class="codex-ability"><strong>${escapeHtml(ability.name)}</strong><div class="codex-ability-detail">${escapeHtml(ability.detail)}</div></article>`).join('')}</div>
          </div>`
        }).join('')}
      </div>
    </div>
  </div>`
}

function renderProfileModal() {
  const username = state.currentUser?.username || 'Jogador'
  const currentNickname = getPlayerNickname(username)
  const draft = state.profileDraft || currentNickname
  const avatar = getPlayerAvatar()
  const availableAvatars = Object.values(characters)
    .map((character) => ({ character, path: videoManifest[character.id]?.icon }))
    .filter((item) => item.path)
  return `<div class="profile-overlay" data-action="close-profile-backdrop">
    <div class="profile-panel" role="dialog" aria-modal="true" aria-label="Perfil do jogador">
      <div class="profile-header">
        <span class="profile-avatar">${avatar ? `<img src="${avatar}" alt="Avatar do jogador">` : getPlayerInitials(currentNickname, username)}</span>
        <div>
          <p>PERFIL DO JOGADOR</p>
          <input type="text" class="profile-name-input" data-profile-input maxlength="24" value="${escapeHtml(draft)}" placeholder="Digite seu nickname" autocomplete="off">
        </div>
      </div>
      <div class="profile-field profile-avatar-field">
        <span>ESCOLHA SEU AVATAR</span>
        <div class="profile-avatar-options">
          ${availableAvatars.length ? availableAvatars.map(({ character, path }) => `<button type="button" class="profile-avatar-option ${avatar === `${MEDIA_BASE_URL}${path}` ? 'selected' : ''}" data-profile-avatar="${path}" title="Usar ícone de ${character.name}"><img src="${MEDIA_BASE_URL}${path}" alt="${character.name}"></button>`).join('') : '<small class="profile-avatar-empty">Nenhum ícone foi publicado ainda.</small>'}
        </div>
      </div>
      <div class="profile-account-line">
        <small>Login da conta</small>
        <strong>${escapeHtml(username)}</strong>
      </div>
      <a class="community-button" href="https://chat.whatsapp.com/KIZI0MaKVJC6084CIXicNy?s=cl&p=a&mlu=4&ilr=4" target="_blank" rel="noopener noreferrer"><i data-lucide="Users"></i><span>Comunidade</span></a>
      <div class="profile-actions">
        <button type="button" class="primary-button" data-action="close-profile">OK</button>
      </div>
    </div>
  </div>`
}

function getPlayerNickname(username = state.currentUser?.username || 'Jogador') {
  const stored = localStorage.getItem('leet-player-nickname') || ''
  return (stored || username).trim() || username
}

function getPlayerAvatar() {
  return localStorage.getItem('leet-player-avatar') || ''
}

function getPlayerInitials(name = getPlayerNickname(), fallback = state.currentUser?.username || 'Jogador') {
  const value = (name || fallback || 'JG').trim()
  return value.slice(0, 2).toUpperCase()
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const RANK_TIERS = [
  { min: 90, label: 'Mestre', short: 'M', color: '#ff5fd1' },
  { min: 75, label: 'Platina', short: 'P', color: '#79d6c2' },
  { min: 60, label: 'Ouro', short: 'O', color: '#d7ad2e' },
  { min: 40, label: 'Prata', short: 'S', color: '#c7cdd1' },
  { min: 20, label: 'Bronze', short: 'B', color: '#c9793f' },
  { min: 0, label: 'Ferro', short: 'F', color: '#8a928d' },
]

function getPlayerStats(username = state.currentUser?.username || 'Jogador') {
  try {
    const stats = JSON.parse(localStorage.getItem(`leet-stats-${username}`) || 'null')
    if (stats && typeof stats === 'object') return { wins: 0, losses: 0, draws: 0, ...stats }
  } catch {}
  return { wins: 0, losses: 0, draws: 0 }
}

function savePlayerStats(username, stats) {
  localStorage.setItem(`leet-stats-${username}`, JSON.stringify(stats))
}

function recordMatchResult(outcome, username = state.currentUser?.username || 'Jogador') {
  const stats = getPlayerStats(username)
  if (outcome === 'win') stats.wins += 1
  else if (outcome === 'loss') stats.losses += 1
  else stats.draws += 1
  savePlayerStats(username, stats)
}

function getPlayerRank(username = state.currentUser?.username || 'Jogador') {
  const { wins, losses, draws } = getPlayerStats(username)
  const matches = wins + losses + draws
  // vitórias pesam mais que derrotas no cálculo do % de aproveitamento
  const winWeight = 1.5
  const lossWeight = 1
  const weightedTotal = wins * winWeight + losses * lossWeight
  const winRate = weightedTotal > 0 ? Math.round((wins * winWeight / weightedTotal) * 100) : 0
  if (matches === 0) {
    return { label: 'Sem rank', shortLabel: '', color: '#5c6662', winRate: 0, tooltip: 'Jogue sua primeira partida para ganhar um rank.' }
  }
  const tier = RANK_TIERS.find((item) => winRate >= item.min) || RANK_TIERS[RANK_TIERS.length - 1]
  const tooltip = `${tier.label} · ${winRate}% de aproveitamento\n${wins} vitórias · ${losses} derrotas · ${draws} empates · ${matches} partidas`
  return { label: tier.label, shortLabel: tier.short, color: tier.color, winRate, tooltip }
}

function rankFromRecord(wins, losses, draws = 0) {
  const matches = wins + losses + draws
  const winWeight = 1.5
  const lossWeight = 1
  const weightedTotal = wins * winWeight + losses * lossWeight
  const winRate = weightedTotal > 0 ? Math.round((wins * winWeight / weightedTotal) * 100) : 0
  const tier = matches === 0 ? { label: 'Sem rank', short: '–', color: '#5c6662' } : (RANK_TIERS.find((item) => winRate >= item.min) || RANK_TIERS[RANK_TIERS.length - 1])
  return { wins, losses, draws, matches, winRate, label: tier.label, shortLabel: tier.short, color: tier.color }
}

function getLeaderboardEntries() {
  const username = state.currentUser?.username || 'Jogador'
  const you = getPlayerStats(username)
  const sample = [
    { name: 'Leet Tytalo', wins: 31, losses: 6 },
    { name: 'Cedric Storm', wins: 24, losses: 9 },
    { name: 'Maria V.', wins: 14, losses: 12 },
  ]
  const entries = [
    { name: getPlayerNickname(username), isYou: true, ...rankFromRecord(you.wins, you.losses, you.draws) },
    ...sample.map((player) => ({ name: player.name, isYou: false, ...rankFromRecord(player.wins, player.losses) })),
  ]
  return entries.sort((a, b) => b.winRate - a.winRate || b.matches - a.matches)
}

function renderLeaderboardModal() {
  const entries = getLeaderboardEntries()
  return `<div class="profile-overlay" data-action="close-leaderboard-backdrop">
    <div class="profile-panel leaderboard-panel" role="dialog" aria-modal="true" aria-label="Ranking dos jogadores">
      <div class="profile-header">
        <span class="profile-avatar"><i data-lucide="Trophy"></i></span>
        <div>
          <p>RANKING DA ARENA</p>
          <h2>Melhores jogadores</h2>
        </div>
      </div>
      <div class="leaderboard-list">
        ${entries.map((entry, index) => `<div class="leaderboard-row ${entry.isYou ? 'own' : ''}">
          <span class="leaderboard-position">#${index + 1}</span>
          <div class="leaderboard-name"><strong>${escapeHtml(entry.name)}${entry.isYou ? ' (você)' : ''}</strong><small>${entry.matches} partidas · ${entry.wins}V ${entry.losses}D${entry.draws ? ` ${entry.draws}E` : ''}</small></div>
          <span class="leaderboard-tier" style="--rank-color:${entry.color}">${entry.label}<b>${entry.winRate}%</b></span>
        </div>`).join('')}
      </div>
      <div class="profile-actions">
        <button type="button" class="primary-button" data-action="close-leaderboard">OK</button>
      </div>
    </div>
  </div>`
}

function renderComingSoonModal() {
  return `<div class="profile-overlay" data-action="close-coming-soon-backdrop">
    <div class="profile-panel coming-soon-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(state.comingSoonLabel)}">
      <div class="profile-header">
        <span class="profile-avatar"><i data-lucide="Radio"></i></span>
        <div>
          <p>${escapeHtml(state.comingSoonLabel.toUpperCase())}</p>
          <h2>Em breve</h2>
        </div>
      </div>
      <div class="profile-actions">
        <button type="button" class="primary-button" data-action="close-coming-soon">OK</button>
      </div>
    </div>
  </div>`
}

function renderDashboard() {
  return `<section class="ops-shell">
    ${renderUpdateBanner()}
    <aside class="ops-sidebar">
      <div class="ops-brand"><span>LA</span><div><strong>LEET ARENA</strong><small>Operations Console</small></div></div>
      <nav class="ops-nav" aria-label="Navegação principal">
        ${dashboardNavItem('overview', 'LayoutDashboard', 'Visão Geral')}
        ${dashboardNavItem('battles', 'Swords', 'Combates')}
        ${dashboardNavItem('players', 'Users', 'Jogadores')}
        ${dashboardNavItem('feed', 'ScrollText', 'Registro de Eventos')}
        ${dashboardNavItem('mail', 'Mail', 'Correio')}
        ${dashboardNavItem('settings', 'Settings', 'Configurações')}
      </nav>
      <div class="ops-sidebar-status"><span class="live-dot"></span><div><strong>Sistemas operacionais</strong><small>Todos os serviços online</small></div></div>
    </aside>
    <main class="ops-main">
      ${renderOpsHeader()}
      ${renderDashboardContent()}
    </main>
  </section>`
}

function dashboardNavItem(id, icon, label) {
  return `<button class="ops-nav-item ${state.dashboardTab === id ? 'active' : ''}" data-dashboard-tab="${id}"><i data-lucide="${icon}"></i><span>${label}</span></button>`
}

function renderOpsHeader() {
  return `<header class="ops-header">
    <div><p>PAINEL DE CONTROLE</p><h1>${dashboardTitle()}</h1></div>
    <div class="ops-header-actions">
      <button class="icon-button" data-action="toggle-search" title="Pesquisar"><i data-lucide="Search"></i></button>
      <button class="icon-button notification-button" data-action="notifications" title="Notificações"><i data-lucide="Bell"></i><span></span></button>
      <button class="profile-button" data-dashboard-tab="settings"><span>${(state.currentUser?.username || 'AD').slice(0, 2).toUpperCase()}</span><strong>${state.currentUser?.username || 'Administrador'}</strong><i data-lucide="ChevronDown"></i></button>
      <button class="icon-button" data-action="account-logout" title="Sair da conta"><i data-lucide="LogOut"></i></button>
    </div>
    ${state.dashboardSearchOpen ? `<label class="ops-search"><i data-lucide="Search"></i><input data-dashboard-search value="${escapeHtml(state.dashboardQuery)}" placeholder="Buscar eventos, jogadores ou salas"></label>` : ''}
  </header>`
}

function dashboardTitle() {
  return ({ overview: 'Visão Geral', battles: 'Combates', players: 'Jogadores', feed: 'Registro de Eventos', mail: 'Correio', settings: 'Configurações' })[state.dashboardTab] || 'Visão Geral'
}

function renderDashboardContent() {
  if (state.dashboardTab === 'battles') return renderBattlesWorkspace()
  if (state.dashboardTab === 'players') return renderPlayersWorkspace()
  if (state.dashboardTab === 'feed') return renderEventWorkspace()
  if (state.dashboardTab === 'mail') return renderMailWorkspace()
  if (state.dashboardTab === 'settings') return renderSettingsWorkspace()
  return renderOverviewWorkspace()
}

function renderMailWorkspace() {
  const mail = state.adminMail
  const sent = getMailbox()
  return `<div class="ops-workspace single"><section class="workspace-panel">
    <div class="section-heading"><div><p>COMUNICAÇÃO</p><h2>Enviar e-mail aos jogadores</h2></div><span class="status-badge"><i data-lucide="Mail"></i>${sent.length} enviados</span></div>
    <label class="admin-login-field"><span>ASSUNTO</span><input data-mail-subject value="${escapeHtml(mail.subject)}" placeholder="Ex.: Nova atualização disponível"></label>
    <label class="admin-login-field"><span>MENSAGEM</span><textarea data-mail-body rows="5" placeholder="Escreva a mensagem enviada a todos os jogadores">${escapeHtml(mail.body)}</textarea></label>
    <button class="admin-login-submit" data-action="send-mail">ENVIAR PARA OS JOGADORES</button>
    <p class="admin-status">${escapeHtml(mail.status)}</p>
    <div class="mail-sent-list">${sent.length ? sent.map((item) => `<div class="mail-sent-item"><strong>${escapeHtml(item.subject)}</strong><small>${new Date(item.sentAt).toLocaleString('pt-BR')}${item.read ? ' · lido' : ' · não lido'}</small></div>`).join('') : '<p class="muted">Nenhum e-mail enviado ainda.</p>'}</div>
  </section></div>`
}

function renderOverviewWorkspace() {
  const events = dashboardEvents().filter((event) => state.dashboardFilter === 'all' || event.type === state.dashboardFilter)
  return `<div class="ops-workspace">
    ${state.dashboardNotice && state.dashboardNotice !== 'search' ? `<div class="ops-notice">${escapeHtml(state.dashboardNotice)}</div>` : ''}
    <section class="metric-grid">
      ${metricCard('Swords', 'Partidas Hoje', '42', '+12,5%', '↑')}
      ${metricCard('Users', 'Jogadores Ativos', '127', '+8,2%', '↑')}
      ${metricCard('Clock3', 'Tempo de Jogo', '247,8h', '+5,4%', '↑')}
      ${metricCard('Trophy', 'Taxa de Vitória', '42,9%', 'Cedric lidera', '')}
    </section>
    <section class="ops-grid">
      <div class="activity-panel">
        <div class="section-heading"><div><p>ATIVIDADE DA ARENA</p><h2>Eventos em tempo real</h2></div><div class="filter-pills"><button class="${state.dashboardFilter === 'all' ? 'active' : ''}" data-dashboard-filter="all">Todos</button><button class="${state.dashboardFilter === 'duel' ? 'active' : ''}" data-dashboard-filter="duel">Duelos</button></div></div>
        <div class="timeline">${events.map(renderTimelineEvent).join('')}</div>
        <button class="text-button" data-dashboard-tab="feed">Ver registro completo <span>→</span></button>
      </div>
      <aside class="ops-rail">
        <section class="highlight-panel"><div class="section-heading compact"><div><p>DESTAQUE</p><h2>Jogador do dia</h2></div><i data-lucide="Trophy"></i></div><div class="player-highlight"><span>CS</span><div><strong>Cedric Storm</strong><small>8 vitórias consecutivas</small></div></div><div class="win-rate"><span>Taxa de vitória</span><strong>71,4%</strong></div><div class="progress-track"><i style="width:71.4%"></i></div></section>
        <section class="rooms-panel"><div class="section-heading compact"><div><p>AGORA</p><h2>Salas recentes</h2></div><span class="room-count">${Math.max(3, state.publicRooms.length)} abertas</span></div>${renderRecentRooms()}<button class="outline-action" data-action="create-online"><i data-lucide="Plus"></i>Criar nova sala</button></section>
      </aside>
    </section>
    <section class="trend-panel"><div class="section-heading"><div><p>DESEMPENHO</p><h2>Atividade da semana</h2></div><div class="filter-pills"><button class="${state.dashboardRange === 'daily' ? 'active' : ''}" data-dashboard-range="daily">Diário</button><button class="${state.dashboardRange === 'weekly' ? 'active' : ''}" data-dashboard-range="weekly">Semanal</button></div></div>${renderTrendChart()}</section>
  </div>`
}

function metricCard(icon, label, value, delta, direction) {
  return `<article class="metric-card"><div class="metric-icon"><i data-lucide="${icon}"></i></div><div><p>${label}</p><strong>${value}</strong><small class="${direction ? 'positive' : ''}">${direction} ${delta}</small></div></article>`
}

function dashboardEvents() {
  const liveEvents = state.log.slice(0, 3).map((text, index) => ({ icon: 'Zap', type: 'duel', title: text, meta: `há ${index + 1} min`, accent: 'green' }))
  return [...liveEvents, { icon: 'Swords', type: 'duel', title: 'Cedric venceu Voss', meta: 'há 4 min · Arena Norte', accent: 'green' }, { icon: 'UserRound', type: 'player', title: 'Nova jogadora entrou na arena', meta: 'há 11 min · Maria V.', accent: 'yellow' }, { icon: 'ShieldCheck', type: 'system', title: 'Temporada classificada atualizada', meta: 'há 24 min · Sistema', accent: 'gray' }, { icon: 'Radio', type: 'duel', title: 'Sala #8249 iniciou um duelo', meta: 'há 38 min · 2 jogadores', accent: 'yellow' }]
}

function renderTimelineEvent(event) {
  return `<article class="timeline-event"><div class="timeline-marker ${event.accent}"><i data-lucide="${event.icon}"></i></div><div><strong>${event.title}</strong><small>${event.meta}</small></div><span>${event.type === 'duel' ? 'COMBATE' : event.type === 'player' ? 'JOGADOR' : 'SISTEMA'}</span></article>`
}

function renderRecentRooms() {
  const rooms = state.publicRooms.length ? state.publicRooms.slice(0, 3) : [{ code: '8249', players: 1, hostCharacter: 'cedric' }, { code: '7312', players: 1, hostCharacter: 'voss' }, { code: '6104', players: 1, hostCharacter: 'cedric' }]
  return `<div class="recent-rooms">${rooms.map((room) => `<button data-room-code-entry="${room.code}"><span class="room-live"></span><div><strong>${formatRoomSummary(room)}</strong><small>${roomPlayerCount(room)}</small></div><b>Entrar</b></button>`).join('')}</div>`
}

function renderTrendChart() {
  const values = state.dashboardRange === 'daily' ? [34, 52, 46, 74, 61, 88, 70] : [48, 61, 55, 76, 69, 91, 84]
  return `<div class="trend-chart" aria-label="Gráfico de atividade">${values.map((value, index) => `<div><i style="height:${value}%"></i><span>${['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'][index]}</span></div>`).join('')}</div>`
}

function renderBattlesWorkspace() {
  const isOnlineMode = state.homeMode === 'online'
  return `<div class="ops-workspace single"><section class="workspace-panel"><div class="section-heading"><div><p>COMBATES</p><h2>Preparar novo duelo</h2></div><span class="status-badge"><i data-lucide="Wifi"></i>Servidor online</span></div><div class="mode-selector"><button class="primary-button ${isOnlineMode ? 'active' : ''}" data-action="show-online-mode">DUELO</button><button class="primary-button secondary ${!isOnlineMode ? 'active' : ''}" data-action="show-offline-mode">MODO TESTE</button></div>${isOnlineMode ? renderOnlinePanel() : renderOfflinePanel()}</section></div>`
}

function renderPlayersWorkspace() {
  return `<div class="ops-workspace single"><section class="workspace-panel"><div class="section-heading"><div><p>ELENCO</p><h2>Jogadores ativos</h2></div><button class="outline-action"><i data-lucide="Plus"></i>Novo jogador</button></div><div class="player-table"><div><span>LT</span><strong>Leet Tytalo<small>Administrador · Online agora</small></strong><b>84% vitórias</b></div><div><span>CS</span><strong>Cedric Storm<small>Elite · 8 vitórias seguidas</small></strong><b>71,4% vitórias</b></div><div><span>MV</span><strong>Maria V.<small>Competidora · Última partida há 11 min</small></strong><b>58% vitórias</b></div></div></section></div>`
}

function renderEventWorkspace() {
  return `<div class="ops-workspace single"><section class="workspace-panel"><div class="section-heading"><div><p>AUDITORIA</p><h2>Registro de eventos</h2></div><span class="status-badge"><i data-lucide="Activity"></i>Tempo real</span></div><div class="timeline full">${dashboardEvents().map(renderTimelineEvent).join('')}</div></section></div>`
}

function renderSettingsWorkspace() {
  return `<div class="ops-workspace single"><section class="workspace-panel"><div class="section-heading"><div><p>SISTEMA</p><h2>Configurações</h2></div><span class="status-badge">${state.appVersionName ? `v${state.appVersionName}` : 'Web'}</span></div><div class="settings-list"><button data-action="check-update"><i data-lucide="Activity"></i><span><strong>Verificar atualização</strong><small>${state.updateError || 'Consultar a versão mais recente do aplicativo'}</small></span></button><button data-action="open-admin"><i data-lucide="Settings"></i><span><strong>Administração de mídia</strong><small>Gerenciar vídeos das habilidades</small></span></button></div></section></div>`
}

function renderOfflinePanel() {
  return `
    <div class="panel-label">NOVA PARTIDA</div>
    ${playerPicker(0, 'JOGADOR 1', 'cedric')}
    <div class="versus">VS</div>
    ${playerPicker(1, 'JOGADOR 2', 'voss')}
    <button class="primary-button" data-action="start">MODO TESTE <span>↗</span></button>
  `
}

function renderBattle2v2Panel() {
  return `
    <div class="panel-label">NOVO MODO</div>
    <div class="coming-soon-box">
      <strong>Batalha 2x2 chegando em breve</strong>
      <p>Monte sua dupla e enfrente outra equipe em combates simultâneos. Estamos preparando esse modo.</p>
    </div>
  `
}

function renderTournamentPanel() {
  return `
    <div class="panel-label">COMPETIÇÃO</div>
    <div class="coming-soon-box">
      <strong>Em breve</strong>
      <p>Os torneios da arena estão sendo preparados. Em breve você poderá disputar chaves e premiações.</p>
    </div>
  `
}

function renderOnlinePanel() {
  return `
    <div class="online-box rpg-room-panel">
      <div class="online-header-row">
        <div><strong>Salas da arena</strong><small>${state.createdRoomCode ? 'Aguardando o segundo jogador.' : 'Escolha um desafio ou abra uma sala.'}</small></div>
        ${!state.createdRoomCode ? '<button class="primary-button small compact-create" data-action="create-online">CRIAR SALA</button>' : ''}
      </div>
      <div class="public-rooms">${renderPublicRooms()}</div>
      <p class="online-error">${state.onlineError}</p>
    </div>
  `
}

function renderUpdateBanner() {
  if (!state.updateAvailable) return ''
  const manifest = state.updateManifest ?? {}
  const progress = Math.round(state.updateProgress)
  const indeterminate = state.updateInstalling && progress <= 0
  const size = state.updateTotal ? `${(state.updateDownloaded / 1048576).toFixed(1)} / ${(state.updateTotal / 1048576).toFixed(1)} MB` : ''
  return `<div class="update-overlay">
    <div class="update-dialog" role="dialog" aria-modal="true">
      <p class="eyebrow">ATUALIZAÇÃO DO JOGO</p>
      <h2>O GAME FOI ATUALIZADO</h2>
      <p class="update-version">Versão ${manifest.versionName ?? ''}</p>
      ${manifest.notes ? `<div class="update-notes"><strong>NOTAS DA ATUALIZAÇÃO</strong><p>${manifest.notes}</p></div>` : ''}
      ${state.updateInstalling ? `<div class="update-progress-wrap"><div class="update-progress-label"><span>${indeterminate ? (state.updateStatus || 'Preparando o pacote...') : (state.updateStatus || 'Baixando atualização...')}</span><strong>${indeterminate ? '' : `${progress}%`}</strong></div><div class="update-progress-track ${indeterminate ? 'indeterminate' : ''}"><i style="width:${indeterminate ? '100' : progress}%"></i></div><small>${indeterminate ? 'Isso pode levar alguns instantes.' : size}</small></div>` : '<p class="update-required-copy">Clique abaixo para atualizar e continuar jogando.</p>'}
      <div class="update-actions">
        <button class="primary-button small" data-action="install-update" ${state.updateInstalling ? 'disabled' : ''}>${state.updateInstalling ? 'ATUALIZANDO...' : 'ATUALIZAR AGORA'}</button>
      </div>
    </div>
  </div>`
}

function formatRoomSummary(room) {
  const members = room.members?.length ? room.members : [{ name: currentPlayerName() }]
  return `Sala de ${members[0]?.name || 'Jogador'}`
}

function roomPlayerCount(room) {
  const members = room.members?.length ? room.members : []
  const playerCount = room.players ?? members.length
  const maxPlayers = room.maxPlayers ?? 2
  return `${playerCount}/${maxPlayers} jogadores`
}

function roomOwnerName(room) {
  return room.members?.[0]?.name || currentPlayerName()
}

function renderPublicRooms() {
  if (!state.publicRooms.length) return '<p class="muted">Nenhuma sala aberta. Crie uma sala para aparecer aqui.</p>'
  return state.publicRooms.map(renderRoomEntry).join('')
}

function renderRoomEntry(room) {
  const isOwnRoom = state.createdRoomCode === room.code
  const isInProgress = room.status === 'in_progress' || (room.players ?? 0) >= (room.maxPlayers ?? 2)
  const action = isOwnRoom ? '<button class="close-room-btn" data-action="close-created-room" title="Encerrar sala">✕</button>' : isInProgress ? '<span class="room-status">PARTIDA EM ANDAMENTO</span>' : `<button class="room-join" data-room-code-entry="${room.code}">ENTRAR</button>`
  const ownerAvatar = room.members?.[0]?.avatar || (isOwnRoom ? getPlayerAvatar() : '')
  const crest = ownerAvatar ? `<img src="${ownerAvatar}" alt="">` : roomOwnerName(room).slice(0, 1).toUpperCase()
  return `<div class="room-entry ${isOwnRoom ? 'own' : ''} ${isInProgress ? 'playing' : ''}"><span class="room-crest">${crest}</span><div class="room-copy"><strong>${formatRoomSummary(room)}</strong><small>${roomPlayerCount(room)}</small></div>${action}</div>`
}

function playerPicker(index, label, fallback) {
  return `<label class="picker"><span>${label}</span><select data-player="${index}">
    ${Object.values(characters).map((character) => `<option value="${character.id}" ${character.id === fallback ? 'selected' : ''}>${character.name} — ${character.title}</option>`).join('')}
  </select></label>`
}

function getBattleDisplayName(index, fallbackName = 'Jogador') {
  if (state.online && state.onlinePlayerNames?.[index]) return state.onlinePlayerNames[index]
  const base = index === 0 ? (state.currentUser?.username || 'Jogador') : (state.currentUser?.username || 'Jogador 2')
  return getPlayerNickname(base)
}

function battleSlotLabel(index, player) {
  const name = getBattleDisplayName(index, player.name)
  return `${name.toUpperCase()} (${player.name.toUpperCase()})`
}

function getHpBarColor(percent) {
  if (percent <= 30) return '#ff4b4b'
  if (percent <= 40) return '#f6c453'
  return '#35bd54'
}

function renderBattle() {
  const [p1, p2] = state.players
  const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
  const activePlayer = state.players[activeIndex]
  const selected = state.selections[state.phase]
  const finished = Boolean(state.result)
  const p1Percent = Math.min(100, Math.max(0, p1.hp / p1.maxHp * 100))
  const p2Percent = Math.min(100, Math.max(0, p2.hp / p2.maxHp * 100))
  return `<section class="battle-shell">
    <header class="battle-topbar"><div class="top-player"><strong>${battleSlotLabel(0, p1)}</strong>${hpDeltaBadge(0)}<div class="top-hp"><i style="width:${p1Percent}%; background:${getHpBarColor(p1Percent)}"></i><span class="top-hp-value">${p1.hp}/${p1.maxHp}</span></div></div><div class="turn-count">TURNO <strong>${state.turn}</strong><span class="turn-timer">${Math.max(0, state.turnTimeLeft)}s</span></div><div class="top-player opponent"><strong>${battleSlotLabel(1, p2)}</strong>${hpDeltaBadge(1)}<div class="top-hp"><i style="width:${p2Percent}%; background:${getHpBarColor(p2Percent)}"></i><span class="top-hp-value">${p2.hp}/${p2.maxHp}</span></div></div></header>
    <div class="battle-layout">
      <div class="arena-column">
        ${lastActionPanel()}
        <div class="arena-scene">
        </div>
        ${finished ? resultPanel() : actionPanel(activePlayer, state.players[activeIndex === 0 ? 1 : 0])}
      </div>
      <aside class="combat-log"><div class="panel-label">REGISTRO DE COMBATE</div><div class="log-list">${state.log.length ? state.log.map((entry) => `<p>${entry}</p>`).join('') : '<p class="muted">As ações do duelo aparecerão aqui.</p>'}</div></aside>
    </div>
    <button class="surrender-discrete-btn" data-action="prompt-surrender">SAIR</button>
    ${state.online && !finished ? '<button class="battle-chat-button" data-action="open-private-chat" title="Chat da partida"><i data-lucide="MessageCircle"></i></button>' : ''}
    ${renderSurrenderModal()}
    ${renderDenyPickerModal()}
    ${renderForesightPickerModal()}
    ${renderPressurePickerModal()}
    ${renderActionNoticeModal()}
    ${state.chatOpen ? renderChatModal() : ''}
  </section>`
}

function hpDeltaBadge(index) {
  const delta = state.hpDeltas?.[index]
  if (!delta) return ''
  return `<span class="hp-delta-stack">
    ${delta.damage ? `<b class="hp-delta damage">-${delta.damage}</b>` : ''}
    ${delta.heal ? `<b class="hp-delta heal">+${delta.heal}</b>` : ''}
  </span>`
}

function renderPressurePickerModal() {
  if (!state.pressurePickerOpen) return ''
  const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
  const opponent = state.players[activeIndex === 0 ? 1 : 0]
  if (!opponent) return ''
  const options = opponent.character.abilities.filter((ability) => !isPassiveAbility(ability))
  return `<div class="modal-overlay">
    <div class="modal-card deny-picker">
      <p class="modal-title">PRESSÃO</p>
      <p class="modal-sub">Escolha qual habilidade de ${escapeHtml(opponent.name)} será bloqueada por 1 turno.</p>
      <div class="deny-options">${options.map((ability) => `<button class="deny-option" data-pressure-target="${ability.id}">${escapeHtml(ability.name)}</button>`).join('')}</div>
      <div class="modal-btns">
        <button class="primary-button small secondary" data-action="cancel-pressure">CANCELAR</button>
      </div>
    </div>
  </div>`
}

function renderForesightPickerModal() {
  if (!state.foresightPickerOpen) return ''
  const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
  const opponent = state.players[activeIndex === 0 ? 1 : 0]
  if (!opponent) return ''
  const options = opponent.character.abilities.filter((ability) => !isPassiveAbility(ability))
  return `<div class="modal-overlay">
    <div class="modal-card deny-picker">
      <p class="modal-title">PREMONIÇÃO</p>
      <p class="modal-sub">Qual ação ${escapeHtml(opponent.name)} usará no próximo turno?</p>
      <div class="deny-options">${options.map((ability) => `<button class="deny-option" data-foresight-target="${ability.id}">${escapeHtml(ability.name)}</button>`).join('')}</div>
      <div class="modal-btns">
        <button class="primary-button small secondary" data-action="cancel-foresight">CANCELAR</button>
      </div>
    </div>
  </div>`
}

function renderDenyPickerModal() {
  if (!state.denyPickerOpen) return ''
  const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
  const opponent = state.players[activeIndex === 0 ? 1 : 0]
  if (!opponent) return ''
  const options = opponent.character.abilities.filter((ability) => ability.id !== 'basic' && ability.kind !== 'rage')
  return `<div class="modal-overlay">
    <div class="modal-card deny-picker">
      <p class="modal-title">NEGAR QUAL HABILIDADE?</p>
      <p class="modal-sub">Escolha uma habilidade ativa de ${escapeHtml(opponent.name)}.</p>
      <div class="deny-options">${options.map((ability) => `<button class="deny-option" data-deny-target="${ability.id}">${escapeHtml(ability.name)}</button>`).join('')}</div>
      <div class="modal-btns">
        <button class="primary-button small secondary" data-action="cancel-deny">CANCELAR</button>
      </div>
    </div>
  </div>`
}

function renderActionNoticeModal() {
  if (!state.actionNotice) return ''
  return `<div class="modal-overlay">
    <div class="modal-card">
      <p class="modal-title">AVISO</p>
      <p class="modal-sub">${escapeHtml(state.actionNotice)}</p>
      <div class="modal-btns">
        <button class="primary-button small" data-action="close-action-notice">ENTENDI</button>
      </div>
    </div>
  </div>`
}

function renderSurrenderModal() {
  if (!state.showSurrenderModal) return ''
  return `<div class="modal-overlay">
    <div class="modal-card">
      <p class="modal-title">DESEJA SE RENDER?</p>
      <p class="modal-sub">Você abandonará a partida atual.</p>
      <div class="modal-btns">
        <button class="primary-button small danger" data-action="confirm-surrender">SIM</button>
        <button class="primary-button small secondary" data-action="cancel-surrender">NÃO</button>
      </div>
    </div>
  </div>`
}

function lastActionPanel() {
  const latest = state.lastTurnActions.length ? state.lastTurnActions : [{ player: '', text: 'Aguardando escolhas' }, { player: '', text: 'Aguardando escolhas' }]
  const formatAction = (entry) => entry.player ? `${entry.player}: ${entry.text}` : entry.text
  return `<div class="last-action"><div class="last-action-title">ÚLTIMA AÇÃO</div><div class="last-action-copy"><strong>${formatAction(latest[0])}</strong><span class="crossed-swords">⚔</span><strong>${formatAction(latest[1])}</strong></div></div>`
}

function fighterCard(player, index) {
  const hpPercent = Math.min(100, Math.max(0, Math.round((player.hp / player.maxHp) * 100)))
  const trackedResource = player.name === 'Voss' ? 'FÚRIA' : player.name === 'Cedric' && player.markActive ? 'MARCA' : 'ESTADO'
  const trackedValue = player.name === 'Voss' ? player.rage : player.name === 'Cedric' && player.pendingPredatory ? 'PREDATÓRIO' : player.name === 'Cedric' && player.markActive ? `${player.markBasicHits}/2` : '—'
  return `<article class="fighter-card ${index === 1 ? 'right' : ''}" style="--accent:${player.accent}">
    <div class="fighter-placeholder"><span>${player.name.slice(0, 2).toUpperCase()}</span><small>IMAGEM DO PERSONAGEM</small></div>
    <div class="status-plaque"><span>STATUS</span><strong>${trackedResource}: ${trackedValue}</strong></div>
  </article>`
}

function actionPanel(player, opponent) {
  const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
  const selected = state.selections[phase]
  const basic = player.character.abilities.find((ability) => ability.id === 'basic')
  const activeAbilities = player.character.abilities.filter((ability) => ability.id !== 'basic' && ability.kind !== 'pending' && !isPassiveAbility(ability))
  const secondary = activeAbilities[0]
  const extraAbilities = activeAbilities.slice(1)
  const passives = player.character.abilities.filter(isPassiveAbility)
  if (state.online && state.onlineWaiting) {
    return `<div class="action-panel"><div class="waiting-opponent"><span class="pulse-dot">●</span><strong>AGUARDANDO JOGADA DO OPONENTE</strong><small>Sua ação foi registrada neste turno.</small></div></div>`
  }
  if (player.forcedSkipTurns > 0) {
    return `<div class="action-panel"><div class="waiting-opponent"><span class="pulse-dot">●</span><strong>AGUARDANDO A JOGADA DO OPONENTE ⏳</strong><small>O oponente usou Atrapalhar, forçando você a pular o turno.</small></div>
    <button class="skip-button" data-action="skip">CONTINUAR</button></div>`
  }
  const forcedBasicNow = player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn
  return `<div class="action-panel"><div class="action-header"><div><p class="eyebrow">${phase === 'p1' ? 'JOGADOR 1' : 'JOGADOR 2'} / ${state.onlineWaiting ? 'AGUARDANDO OPONENTE' : 'ESCOLHA OCULTA'}</p><h3>${selected ? 'AÇÃO SELECIONADA' : `ESCOLHA DE ${player.name.toUpperCase()}`}</h3></div><span class="lock-icon">${selected ? '◉' : '○'}</span></div>
    <div class="action-buttons">${basic ? abilityButton(player, opponent, basic, selected) : ''}${secondary ? abilityButton(player, opponent, secondary, selected) : ''}${passives.length ? passiveInfoButton(passives) : ''}</div>
    <div class="extra-abilities">${extraAbilities.map((ability) => abilityButton(player, opponent, ability, selected)).join('')}</div>
    <div class="action-footer">${selected ? '<span class="confirmed">ESCOLHA SELECIONADA · AÇÃO ENVIADA IMEDIATAMENTE</span>' : '<span class="muted">Toque para lançar · segure para ver a descrição.</span>'}</div>
    <button class="skip-button" data-action="skip" ${forcedBasicNow ? 'disabled' : ''}>⏭ &nbsp; PULAR TURNO</button>
  </div>`
}

function isPassiveAbility(ability) {
  return ['zero-evolution', 'zero-survival', 'haku-last-dance', 'haku-concentration', 'kiro-luck', 'sany-courage', 'sany-last-chance', 'resistance', 'patience', 'tribute', 'nox-progression'].includes(ability.kind)
}

function passiveInfoButton(passives) {
  const details = passives.map((ability) => `${ability.name}: ${ability.detail}`).join(' | ')
  return `<button class="ability passive-info-button" type="button" data-passive-info="${escapeHtml(details)}"><span class="ability-orb"><i data-lucide="ShieldCheck"></i></span><strong>Passivas</strong><span class="ability-tip passive-tip" hidden>${escapeHtml(details)}</span></button>`
}

function selectedAbilityId(selection) {
  return String(selection || '').split(':')[0]
}

const abilityIcons = { damage: 'Swords', predatory: 'Zap', mark: 'Target', execute: 'Skull', bindings: 'Link', rage: 'Flame', impulse: 'Zap', heal: 'Heart', deny: 'Ban', 'ogro-grab': 'Link', 'ogro-squeeze': 'Flame', 'ogro-release': 'LogOut', 'ogro-kick': 'Zap', 'ogro-roar': 'Activity', 'ogro-throw': 'Sparkles' }

function abilityButton(player, opponent, ability, selected) {
  const disabled = isAbilityUnavailable(player, opponent, ability) || state.onlineWaiting
  const icon = abilityIcons[ability.kind] || 'Sparkles'
  return `<button class="ability ${selectedAbilityId(selected) === ability.id ? 'chosen' : ''} ${disabled ? 'disabled' : ''}" data-ability="${ability.id}" ${disabled ? 'disabled' : ''}>
    <span class="ability-orb"><i data-lucide="${icon}"></i>${ability.uses !== undefined ? `<em>${player.uses[ability.id] ?? ability.uses}</em>` : ''}</span>
    <strong>${escapeHtml(ability.name)}</strong>
    <span class="ability-tip" hidden>${escapeHtml(ability.detail)}</span>
  </button>`
}

function isAbilityUnavailable(player, opponent, ability) {
  const forcedBasic = player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn
  if (player.ogroForcedAbilityId) return ability.id !== player.ogroForcedAbilityId
  return (forcedBasic && ability.id !== 'basic')
    || (player.character?.id === 'haku' && player.hakuDefenseTurns > 0 && ability.id !== 'deep-cut')
    || (player.character?.id === 'ogro' && player.ogroGrabActive && ability.id !== 'squeeze' && ability.id !== 'release')
    || (player.character?.id === 'ogro' && !player.ogroGrabActive && (ability.id === 'squeeze' || ability.id === 'release'))
    || (ability.uses !== undefined && player.uses[ability.id] === 0)
    || (ability.kind === 'impulse' && player.rage < 55)
    || (ability.kind === 'heal' && player.rage < 30)
    || (ability.kind === 'deny' && player.rage < 25)
    || (ability.kind === 'execute' && opponent.hp > opponent.maxHp * 0.25)
    || (ability.kind === 'resurrect' && !player.resurrectUnlocked)
    || (ability.kind === 'broken-limit' && state.turn <= 11)
    || (ability.kind === 'nox-trigger' && !opponent.noxMarks)
    || (ability.kind === 'nox-pressure' && player.noxPressureCharges <= 0)
    || (ability.kind === 'retaliation' && !(player.brickDodges >= 2 && player.brickPunchesReceived >= 6 && player.brickKicksReceived >= 2))
}

function randomAbilityId(player, opponent) {
  const options = player.character.abilities.filter((ability) => !isAbilityUnavailable(player, opponent, ability))
  const pool = options.length ? options : [{ id: 'basic' }]
  return pool[Math.floor(Math.random() * pool.length)].id
}

function resultPanel() {
  return `<div class="result-panel"><p class="eyebrow">RESULTADO DO DUELO</p><h2>${state.result}</h2><button class="primary-button" data-action="restart">NOVA PARTIDA <span>↗</span></button></div>`
}

// O card de vídeo é criado uma única vez e reanexado a cada render, para não perder o estado de reprodução.
let videoCardEl = null
const preloadedMedia = []
const mediaCache = new Map()

function loadMediaAsset(relativeUrl) {
  const normalized = String(relativeUrl || '').trim()
  if (!normalized) return Promise.resolve(null)
  if (mediaCache.has(normalized)) return Promise.resolve(mediaCache.get(normalized))

  const url = `${MEDIA_BASE_URL}${normalized}`
  const isImage = /\.(png|jpe?g|webp)$/i.test(normalized)

  return new Promise((resolve) => {
    const finish = (asset) => {
      mediaCache.set(normalized, asset)
      preloadedMedia.push(asset)
      resolve(asset)
    }

    if (isImage) {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => finish(image)
      image.onerror = () => finish(null)
      image.src = url
      return
    }

    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.oncanplaythrough = () => finish(video)
    video.onerror = () => finish(null)
    video.src = url
    video.load()
  })
}

// Aguarda as mídias dos dois personagens antes de abrir a arena.
async function preloadBattleMedia() {
  preloadedMedia.length = 0
  const urls = []
  state.players.forEach((player) => {
    const entries = videoManifest[player.character.id] ?? {}
    Object.values(entries).forEach((relativeUrl) => {
      if (relativeUrl && !urls.includes(relativeUrl)) urls.push(relativeUrl)
    })
  })
  state.battleLoadTotal = urls.length
  state.battleLoadProgress = urls.length ? 0 : 100
  state.battleLoadStatus = urls.length ? 'Carregando mídias da partida...' : 'Arena pronta.'
  render()

  let loaded = 0
  const markLoaded = () => {
    loaded += 1
    state.battleLoadProgress = (loaded / Math.max(1, urls.length)) * 100
    state.battleLoadStatus = `Carregando mídia ${loaded} de ${urls.length}...`
    render()
  }

  await Promise.all(urls.map(async (relativeUrl) => {
    const asset = await loadMediaAsset(relativeUrl)
    if (asset) markLoaded()
    else markLoaded()
  }))

  state.battleLoadProgress = 100
  state.battleLoadStatus = 'Arena pronta.'
}

function statusPanelMarkup() {
  return `<div class="status-panel">
    <div class="status-group" data-status-group="buffs"><div class="status-items"></div></div>
    <div class="status-group" data-status-group="debuffs"><div class="status-items"></div></div>
    <div class="status-group" data-status-group="warnings"><div class="status-items"></div></div>
  </div>`
}

function getPlayerStatusEffects(player) {
  const buffs = []
  const debuffs = []
  const warnings = []
  if (player.character?.id === 'cedric' && player.friezaUses > 0 && player.friezaBasicHits > 0 && player.friezaBasicHits < 3) {
    buffs.push(`Frieza ${player.friezaBasicHits}/3`)
  }
  if (player.nextBasicBonus > 0 && state.turn <= player.bonusExpiresTurn) {
    buffs.push('Impulso')
  }
  if (player.character?.id === 'voss') {
    buffs.push(`Fúria: ${player.rage}`)
    if (player.ruminationHits > 0 && player.ruminationHits < 3) {
      buffs.push(`Ruminação ${player.ruminationHits}/3`)
    }
  }
  if (player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn) {
    debuffs.push('Amarras 1/2')
  }
  if (player.markActive && player.markSource === 'cedric' && player.markBasicHits < 2) {
    debuffs.push(`Marcar Alvo ${player.markBasicHits}/2`)
  }
  if (player.noxMarks > 0) debuffs.push(`Marcado: ${player.noxMarks}`)
  if (player.blockedAbilityId && state.turn < player.blockedAbilityUntilTurn) {
    const blocked = player.character.abilities.find((item) => item.id === player.blockedAbilityId)
    if (blocked) debuffs.push(player.blockedAbilitySource === 'pressure' ? `Pressão: ${blocked.name} - 1 turno` : `Negação: ${blocked.name}`)
  }
  if (player.character?.id === 'damon') {
    if (player.sacrificeActive) buffs.push('Sacrifício')
    if (player.resurrectUnlocked) buffs.push('Ressuscitar disponível')
    if (player.resistanceStacks > 0) buffs.push(`Resistência ${player.resistanceStacks}`)
    if (player.forcedBasicSource === 'pain-hunger') debuffs.push('Fome de dor')
    if (player.brokenLimitReady) buffs.push('Limite Rompido')
  }
  if (player.character?.id === 'kyn') {
    if (player.drainAvailable > 0) buffs.push(`Dreno ${player.drainAvailable}`)
    if (player.harvestTurns > 0) buffs.push(`Colheita ${player.harvestTurns}/4`)
    if (player.noBasicTurns > 0 && player.noBasicTurns < 3) buffs.push(`Paciência ${player.noBasicTurns}/3`)
    if (player.noDrainTurns > 0 && player.noDrainTurns < 3) buffs.push(`Tributo ${player.noDrainTurns}/3`)
    if (player.secondLifeArmed) buffs.push('Sobrevida')
  }
  if (player.character?.id === 'nox') {
    if (player.noxPressureCharges > 0) buffs.push(`Pressão ${player.noxPressureCharges}`)
    if (player.noxReconstructionActive) buffs.push('Reconstrução')
  }
  if (player.character?.id === 'brick') {
    warnings.push(`Retaliação: S ${Math.min(player.brickPunchesReceived, 6)}/6 E ${Math.min(player.brickDodges, 2)}/2 C ${Math.min(player.brickKicksReceived, 2)}/2`)
    if (player.nextTurnDodge) buffs.push('Esquiva')
    if (player.forcedBasicSource === 'provoke') debuffs.push('Provocar')
  }
  if (player.character?.id === 'zero') {
    if (player.zeroExperience > 0) warnings.push(`Evolução Nv.${player.zeroLevel} · ${player.zeroExperience} EXP`)
    if (player.zeroLevel > 1) buffs.push('Modo sobrevivência')
  }
  if (player.character?.id === 'haku') {
    if (player.hakuDefenseTurns > 0) buffs.push(`Postura Defensiva ${player.hakuDefenseTurns}`)
    if (player.hakuDeepCutTurns > 0) debuffs.push(`Corte Profundo ${player.hakuDeepCutTurns}`)
  }
  if (player.character?.id === 'ogro') {
    if (player.ogroGrabActive) buffs.push('Pego pelo Pescoço')
    if (player.ogroRoarTurns > 0) buffs.push(`Rugido ${player.ogroRoarTurns}`)
    if (player.ogroPantryBonusApplied) buffs.push('Hora do Rango')
  }
  if (player.character?.id === 'kiro') {
    if (player.kiroReductionTurns > 0) buffs.push(`Redução de dano ${player.kiroReductionTurns}`)
    if (player.kiroStrengthBonus > 0) buffs.push(`Fortalecer +${player.kiroStrengthBonus}`)
    if (player.kiroDoubleArmed) buffs.push('Ataque duplo')
  }
  if (player.character?.id === 'sany') {
    if (player.sanyAmplificationUntilTurn >= state.turn) buffs.push('Amplificação')
    if (player.uses['lucky-attack'] > 0) buffs.push(`Ataque de sorte ${player.uses['lucky-attack']}`)
  }
  if (player.ogroGrabbedTurns > 0) debuffs.push(`Preso ${player.ogroGrabbedTurns}`)
  if (player.forcedRandomTurns > 0) debuffs.push('Ação aleatória')
  if (player.forcedSkipTurns > 0) debuffs.push('Atrapalhado')
  return { buffs, debuffs, warnings }
}

function fillStatusGroup(panel, groupName, items, icon) {
  const group = panel.querySelector(`[data-status-group="${groupName}"]`)
  if (!group) return
  const container = group.querySelector('.status-items')
  group.classList.toggle('is-empty', items.length === 0)
  container.innerHTML = items.map((text) => `<p class="status-item">${icon} ${escapeHtml(text)}</p>`).join('')
}

function updateStatusPanels() {
  if (!videoCardEl || !state.players?.length) return
  state.players.forEach((player) => {
    const wrap = videoCardEl.querySelector(`[data-player-slot="${player.name}"]`) || videoCardEl.querySelector(`.${player === state.players[0] ? 'p1' : 'p2'}`)
    const panel = wrap?.querySelector('.status-panel')
    if (!panel) return
    const effects = getPlayerStatusEffects(player)
    fillStatusGroup(panel, 'buffs', effects.buffs, '✅')
    fillStatusGroup(panel, 'debuffs', effects.debuffs, '❌')
    fillStatusGroup(panel, 'warnings', effects.warnings, '⚠️')
  })
}

function createVideoCard() {
  const card = document.createElement('div')
  card.className = 'video-card'
  card.innerHTML = `
    <div class="player-card-wrap p1">
      <div class="video-slot"><span class="video-slot-label">JOGADOR 1</span><img class="idle-frame" alt="" hidden><video playsinline hidden></video></div>
      ${statusPanelMarkup()}
    </div>
    <div class="player-card-wrap p2">
      <div class="video-slot"><span class="video-slot-label">JOGADOR 2</span><img class="idle-frame" alt="" hidden><video playsinline hidden></video></div>
      ${statusPanelMarkup()}
    </div>
  `
  return card
}

function mountVideoCard() {
  const arenaScene = document.querySelector('.arena-scene')
  if (!arenaScene) return
  if (!videoCardEl) videoCardEl = createVideoCard()
  arenaScene.appendChild(videoCardEl)
  updateIdleFrames()
}

function updateIdleFrames() {
  if (!videoCardEl) return
  state.players.forEach((player, index) => {
    const slot = videoCardEl.querySelector(index === 0 ? '.p1' : '.p2')
    const image = slot?.querySelector('.idle-frame')
    if (!image) return
    const idleUrl = getVideoUrl(player.character.id, 'idle')
    if (idleUrl) image.src = `${MEDIA_BASE_URL}${idleUrl}`
    else image.removeAttribute('src')
    image.hidden = !idleUrl
  })
}

function getVideoUrl(characterId, abilityId) {
  return videoManifest[characterId]?.[abilityId] ?? null
}

function enqueueTurnVideos(p1Url, p2Url) {
  if (!p1Url && !p2Url) return
  state.videoQueue = [{ p1: p1Url, p2: p2Url }]
  stopCurrentVideos()
  playNextVideoItem()
}

function playSlot(slotEl, url) {
  const video = slotEl.querySelector('video')
  video.onended = null
  video.onerror = null
  video.onplaying = null
  video.classList.remove('is-ready')
  slotEl.hidden = false
  if (!url) {
    video.pause()
    video.currentTime = 0
    video.hidden = true
    return null
  }
  video.hidden = false
  const finalUrl = `${MEDIA_BASE_URL}${url}`
  if (video.src !== finalUrl && !video.src.endsWith(encodeURI(url))) {
    video.src = finalUrl
    video.load()
  }
  video.muted = false
  video.volume = 1
  video.currentTime = 0
  video.onplaying = () => video.classList.add('is-ready')
  return video
}

function stopCurrentVideos() {
  if (!videoCardEl) return
  videoCardEl.querySelectorAll('video').forEach((video) => {
    video.pause()
    video.onended = null
    video.onerror = null
    video.onplaying = null
    video.classList.remove('is-ready')
    video.currentTime = 0
    video.hidden = true
  })
  state.videoPlaying = false
}

function playNextVideoItem() {
  const item = state.videoQueue.shift()
  if (!videoCardEl || !item) { state.videoPlaying = false; return }
  state.videoPlaying = true
  videoCardEl.hidden = false
  updateIdleFrames()
  const p1Video = playSlot(videoCardEl.querySelector('.p1'), item.p1)
  const p2Video = playSlot(videoCardEl.querySelector('.p2'), item.p2)
  let pending = (p1Video ? 1 : 0) + (p2Video ? 1 : 0)
  // Ao terminar, o vídeo some e a imagem neutra do personagem volta a aparecer.
  const finish = (video) => { video.classList.remove('is-ready'); video.hidden = true; pending -= 1; if (pending <= 0) state.videoPlaying = false }
  if (p1Video) { p1Video.onended = () => finish(p1Video); p1Video.onerror = () => finish(p1Video) }
  if (p2Video) { p2Video.onended = () => finish(p2Video); p2Video.onerror = () => finish(p2Video) }
  if (pending === 0) { state.videoPlaying = false; return }
  Promise.all([p1Video, p2Video].filter(Boolean).map((video) => video.play().catch(() => {
    // Sem gesto do usuário o Android pode recusar áudio; repete sem som para não travar o turno.
    video.muted = true
    return video.play().catch(() => null)
  })))
}

async function loadVideoManifest() {
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/manifest.json?t=${Date.now()}`, { cache: 'no-store' })
    videoManifest = await response.json()
  } catch { videoManifest = {} }
  updateIdleFrames()
}

function clearOnlineSession() {
  if (state.socket) {
    state.socket.intentionalClose = true
    state.socket.close()
    state.socket = null
  }
  if (state.roomFeedSocket) {
    state.roomFeedSocket.close()
    state.roomFeedSocket = null
  }
  state.online = false
  state.roomCode = ''
  state.createdRoomCode = ''
  state.onlineWaiting = false
  state.onlineError = ''
  state.roomFeedConnecting = false
  state.roomFeedConnected = false
  state.privateChatMessages = []
  if (state.screen !== 'battle') state.chatOpen = false
}

function bindEvents() {
  if (state.screen !== 'battle') {
    document.querySelectorAll('button, a').forEach((element) => element.addEventListener('click', playMenuClick, { passive: true }))
  }
  document.querySelectorAll('[data-player]').forEach((select) => select.addEventListener('change', (event) => { select.dataset.value = event.target.value }))
  document.querySelector('[data-action="start"]')?.addEventListener('click', () => { clearOnlineSession(); startMusic(); startGame(); })
  document.querySelector('[data-action="show-online-mode"]')?.addEventListener('click', () => { state.homeMode = 'online'; state.modeDrawerEntering = true; clearOnlineSession(); render(); })
  document.querySelector('[data-action="show-offline-mode"]')?.addEventListener('click', () => { state.homeMode = 'offline'; state.modeDrawerEntering = true; clearOnlineSession(); render(); })
  document.querySelector('[data-action="show-battle2v2-mode"]')?.addEventListener('click', () => { state.homeMode = 'battle2v2'; state.modeDrawerEntering = true; clearOnlineSession(); render(); })
  document.querySelector('[data-action="show-tournament-mode"]')?.addEventListener('click', () => { state.homeMode = 'tournament'; state.modeDrawerEntering = true; clearOnlineSession(); render(); })
  document.querySelectorAll('[data-action="close-mode-drawer"]').forEach((element) => element.addEventListener('click', () => { state.homeMode = ''; state.modeDrawerEntering = false; clearOnlineSession(); render(); }))
  document.querySelector('[data-action="open-codex"]')?.addEventListener('click', () => { state.codexOpen = true; render() })
  document.querySelector('[data-action="open-chat"]')?.addEventListener('click', () => {
    state.chatTab = 'general'
    state.chatOpen = true
    render()
    ensureChatSocket()
  })
  document.querySelector('[data-action="open-private-chat"]')?.addEventListener('click', () => { state.chatTab = 'private'; state.chatOpen = true; render() })
  document.querySelector('[data-action="close-chat"]')?.addEventListener('click', () => { state.chatOpen = false; render() })
  document.querySelector('[data-action="close-chat-backdrop"]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { state.chatOpen = false; render() } })
  document.querySelectorAll('[data-chat-tab]').forEach((button) => button.addEventListener('click', () => { state.chatTab = button.dataset.chatTab; render() }))
  document.querySelector('[data-chat-input]')?.addEventListener('input', (event) => { state.chatDraft = event.target.value })
  document.querySelector('[data-chat-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = state.chatDraft.trim()
    if (!text) return
    const payload = state.chatTab === 'private' && state.screen === 'battle' && state.online
      ? { type: 'private-chat', text }
      : { type: 'general-chat', name: currentPlayerName(), text }
    const socket = payload.type === 'private-chat' ? state.socket : state.roomFeedSocket
    if (socket?.readyState === globalThis.WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
      state.chatDraft = ''
    } else if (payload.type === 'general-chat') {
      ensureChatSocket()
    }
    render()
  })
  document.querySelectorAll('[data-action="next-tip"]').forEach((element) => element.addEventListener('click', (event) => { event.stopPropagation(); shiftLoadingTip(1) }))
  document.querySelector('[data-action="prev-tip"]')?.addEventListener('click', (event) => { event.stopPropagation(); shiftLoadingTip(-1) })
  document.querySelector('[data-action="close-codex"]')?.addEventListener('click', () => { state.codexOpen = false; render() })
  document.querySelector('[data-action="close-codex-backdrop"]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { state.codexOpen = false; render() } })
  document.querySelectorAll('[data-codex-character]').forEach((button) => button.addEventListener('click', () => { state.codexCharacter = state.codexCharacter === button.dataset.codexCharacter ? '' : button.dataset.codexCharacter; render() }))
  document.querySelector('[data-action="create-online"]')?.addEventListener('click', () => {
    if (state.roomFeedConnecting && state.socket) return
    startMusic(); connectOnline('create')
  })
  document.querySelectorAll('[data-room-code-entry]').forEach((button) => button.addEventListener('click', () => { startMusic(); connectOnline('join', button.dataset.roomCodeEntry); }))
  document.querySelector('[data-action="cancel-online"]')?.addEventListener('click', () => {
    clearOnlineSession()
    state.screen = 'home'
    state.homeMode = 'online'
    render()
  })
  document.querySelector('[data-action="close-created-room"]')?.addEventListener('click', () => {
    clearOnlineSession()
    state.screen = 'home'
    state.homeMode = 'online'
    render()
  })
  document.querySelector('[data-action="restart"]')?.addEventListener('click', () => { state.screen = 'home'; render() })
  document.querySelector('[data-action="next-player"]')?.addEventListener('click', confirmSelection)
  document.querySelector('[data-action="skip"]')?.addEventListener('click', skipTurn)
  document.querySelector('[data-action="prompt-surrender"]')?.addEventListener('click', () => { state.showSurrenderModal = true; render(); })
  document.querySelector('[data-action="cancel-surrender"]')?.addEventListener('click', () => { state.showSurrenderModal = false; render(); })
  document.querySelector('[data-action="close-action-notice"]')?.addEventListener('click', () => { state.actionNotice = ''; render(); })
  document.querySelector('[data-action="confirm-surrender"]')?.addEventListener('click', () => {
    if (state.online && !state.result) recordMatchResult('loss')
    clearOnlineSession()
    state.showSurrenderModal = false
    state.screen = 'home'
    state.homeMode = 'online'
    render()
  })
  document.querySelectorAll('[data-ability]').forEach((button) => {
    const tip = button.querySelector('.ability-tip')
    let holdTimer = null
    let held = false
    const startHold = () => {
      held = false
      holdTimer = setTimeout(() => { held = true; if (tip) tip.hidden = false }, 260)
    }
    const endHold = () => {
      clearTimeout(holdTimer)
      if (tip) tip.hidden = true
    }
    button.addEventListener('pointerdown', startHold)
    button.addEventListener('pointerup', endHold)
    button.addEventListener('pointerleave', endHold)
    button.addEventListener('pointercancel', endHold)
    button.addEventListener('contextmenu', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      // Segurar apenas revela a descrição; não seleciona a habilidade.
      if (held) { held = false; return }
      const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
      const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
      const player = state.players[activeIndex]
      const ability = player?.character.abilities.find((item) => item.id === button.dataset.ability)
      if (ability?.kind === 'deny') {
        state.denyPickerOpen = true
        render()
        return
      }
      if (ability?.kind === 'foresight') {
        state.foresightPickerOpen = true
        render()
        return
      }
      if (ability?.kind === 'nox-pressure') {
        state.pressurePickerOpen = true
        render()
        return
      }
      if (ability?.kind === 'nox-mark') {
        const opponent = state.players[activeIndex === 0 ? 1 : 0]
        if (opponent?.noxMarks >= 10) {
          state.actionNotice = 'Nox já atingiu o máximo de 10 marcas aplicadas, para adicionar mais marcas, ative o acionador agora!'
          render()
          return
        }
      }
      chooseAbility(phase, button.dataset.ability)
    })
  })
  document.querySelectorAll('[data-passive-info]').forEach((button) => {
    const tip = button.querySelector('.passive-tip')
    let holdTimer = null
    const open = () => { holdTimer = setTimeout(() => { tip.hidden = false }, 260) }
    const close = () => { clearTimeout(holdTimer); tip.hidden = true }
    button.addEventListener('pointerdown', open)
    button.addEventListener('pointerup', close)
    button.addEventListener('pointerleave', close)
    button.addEventListener('pointercancel', close)
    button.addEventListener('contextmenu', (event) => event.preventDefault())
  })
  document.querySelectorAll('[data-deny-target]').forEach((button) => button.addEventListener('click', () => {
    const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
    state.denyTargetAbilityId = button.dataset.denyTarget
    state.denyPickerOpen = false
    chooseAbility(phase, 'denial')
  }))
  document.querySelector('[data-action="cancel-deny"]')?.addEventListener('click', () => { state.denyPickerOpen = false; render() })
  document.querySelectorAll('[data-foresight-target]').forEach((button) => button.addEventListener('click', () => {
    const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
    state.foresightPickerOpen = false
    chooseAbility(phase, `foresight:${button.dataset.foresightTarget}`)
  }))
  document.querySelector('[data-action="cancel-foresight"]')?.addEventListener('click', () => { state.foresightPickerOpen = false; render() })
  document.querySelectorAll('[data-pressure-target]').forEach((button) => button.addEventListener('click', () => {
    const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
    state.pressurePickerOpen = false
    chooseAbility(phase, `pressure:${button.dataset.pressureTarget}`)
  }))
  document.querySelector('[data-action="cancel-pressure"]')?.addEventListener('click', () => { state.pressurePickerOpen = false; render() })
  document.querySelector('[data-action="install-update"]')?.addEventListener('click', applyUpdate)
  document.querySelector('[data-action="exit-update"]')?.addEventListener('click', exitApp)
  document.querySelector('[data-action="check-update"]')?.addEventListener('click', checkForUpdateNow)
  document.querySelector('[data-action="open-profile"]')?.addEventListener('click', () => { state.profileDraft = getPlayerNickname(state.currentUser?.username || 'Jogador'); state.profileOpen = true; render() })
  document.querySelector('[data-action="close-profile"]')?.addEventListener('click', () => { state.profileOpen = false; state.profileDraft = ''; render() })
  document.querySelector('[data-action="close-profile-backdrop"]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { state.profileOpen = false; state.profileDraft = ''; render() } })
  document.querySelector('[data-action="open-leaderboard"]')?.addEventListener('click', () => { state.leaderboardOpen = true; render() })
  document.querySelector('[data-action="close-leaderboard"]')?.addEventListener('click', () => { state.leaderboardOpen = false; render() })
  document.querySelector('[data-action="close-leaderboard-backdrop"]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { state.leaderboardOpen = false; render() } })
  document.querySelectorAll('[data-action="open-coming-soon"]').forEach((button) => button.addEventListener('click', () => { state.comingSoonLabel = button.dataset.comingSoon || ''; state.comingSoonOpen = true; render() }))
  document.querySelector('[data-action="close-coming-soon"]')?.addEventListener('click', () => { state.comingSoonOpen = false; render() })
  document.querySelector('[data-action="close-coming-soon-backdrop"]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { state.comingSoonOpen = false; render() } })
  document.querySelector('[data-profile-input]')?.addEventListener('input', (event) => {
    const cleaned = event.target.value.trim()
    const nextName = cleaned || state.currentUser?.username || 'Jogador'
    state.profileDraft = event.target.value
    localStorage.setItem('leet-player-nickname', nextName)
    if (state.currentUser) {
      state.currentUser.nickname = nextName
      localStorage.setItem('leet-auth-user', JSON.stringify(state.currentUser))
    }
    if (state.socket && state.socket.readyState === globalThis.WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'rename', name: nextName }))
    }
  })
  document.querySelectorAll('[data-profile-avatar]').forEach((button) => button.addEventListener('click', () => {
    localStorage.setItem('leet-player-avatar', `${MEDIA_BASE_URL}${button.dataset.profileAvatar}`)
    render()
  }))
  document.querySelector('[data-action="toggle-setup"]')?.addEventListener('click', () => { state.setupOpen = !state.setupOpen; render() })
  document.querySelector('[data-action="open-admin"]')?.addEventListener('click', openAdminAccess)
  document.querySelector('[data-auth-form]')?.addEventListener('submit', authenticateAccount)
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => { state.authMode = button.dataset.authMode; state.authError = ''; render() }))
  document.querySelectorAll('[data-action="account-logout"]').forEach((button) => button.addEventListener('click', logoutAccount))
  document.querySelectorAll('[data-dashboard-tab]').forEach((button) => button.addEventListener('click', () => { state.dashboardTab = button.dataset.dashboardTab; state.dashboardNotice = ''; render() }))
  document.querySelectorAll('[data-dashboard-filter]').forEach((button) => button.addEventListener('click', () => { state.dashboardFilter = button.dataset.dashboardFilter; render() }))
  document.querySelectorAll('[data-dashboard-range]').forEach((button) => button.addEventListener('click', () => { state.dashboardRange = button.dataset.dashboardRange; render() }))
  document.querySelector('[data-action="toggle-search"]')?.addEventListener('click', () => { state.dashboardSearchOpen = !state.dashboardSearchOpen; render() })
  document.querySelector('[data-action="notifications"]')?.addEventListener('click', () => { state.dashboardNotice = 'Nenhum alerta crítico. Todos os serviços estão operacionais.'; render() })
  document.querySelector('[data-dashboard-search]')?.addEventListener('input', (event) => { state.dashboardQuery = event.target.value })
  document.querySelector('[data-mail-subject]')?.addEventListener('input', (event) => { state.adminMail.subject = event.target.value })
  document.querySelector('[data-mail-body]')?.addEventListener('input', (event) => { state.adminMail.body = event.target.value })
  document.querySelector('[data-action="send-mail"]')?.addEventListener('click', () => {
    const { subject, body } = state.adminMail
    if (!subject.trim() || !body.trim()) { state.adminMail.status = 'Preencha o assunto e a mensagem.'; render(); return }
    sendAdminMail(subject.trim(), body.trim())
    state.adminMail = { subject: '', body: '', status: 'E-mail enviado aos jogadores.' }
    render()
  })
  document.querySelector('[data-action="open-mailbox"]')?.addEventListener('click', () => {
    saveMailbox(getMailbox().map((mail) => ({ ...mail, read: true })))
    state.mailboxOpen = true
    render()
  })
  document.querySelector('[data-action="close-mailbox"]')?.addEventListener('click', () => { state.mailboxOpen = false; render() })
  document.querySelector('[data-action="close-mailbox-backdrop"]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { state.mailboxOpen = false; render() } })
  document.querySelector('[data-action="admin-back"]')?.addEventListener('click', () => { state.screen = 'dashboard'; render() })
  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => { state.adminTab = button.dataset.adminTab; render() }))
  document.querySelector('[data-admin-character]')?.addEventListener('change', (event) => {
    state.adminUpload.character = event.target.value
    state.adminUpload.ability = characters[event.target.value].abilities[0].id
    state.adminUpload.status = ''
    render()
  })
  document.querySelector('[data-admin-idle-character]')?.addEventListener('change', (event) => {
    state.adminIdle.character = event.target.value
    state.adminIdle.status = ''
    render()
  })
  document.querySelector('[data-admin-icon-character]')?.addEventListener('change', (event) => {
    state.adminIcon.character = event.target.value
    state.adminIcon.status = ''
    render()
  })
  document.querySelector('[data-admin-ability]')?.addEventListener('change', (event) => { state.adminUpload.ability = event.target.value })
  document.querySelector('[data-admin-file]')?.addEventListener('change', (event) => { state.adminUpload.file = event.target.files[0] || null })
  document.querySelector('[data-admin-idle-file]')?.addEventListener('change', (event) => { state.adminIdle.file = event.target.files[0] || null })
  document.querySelector('[data-admin-icon-file]')?.addEventListener('change', (event) => { state.adminIcon.file = event.target.files[0] || null })
  document.querySelector('[data-action="admin-upload"]')?.addEventListener('click', uploadAdminVideo)
  document.querySelector('[data-action="admin-upload-idle"]')?.addEventListener('click', uploadAdminIdleImage)
  document.querySelector('[data-action="admin-upload-icon"]')?.addEventListener('click', uploadAdminIcon)
  document.querySelectorAll('[data-character-choice]').forEach((button) => button.addEventListener('click', () => chooseCharacter(button.dataset.characterChoice)))
}

let menuAudioContext = null

function playMenuClick() {
  if (state.screen === 'battle') return
  try {
    menuAudioContext ??= new AudioContext()
    const oscillator = menuAudioContext.createOscillator()
    const gain = menuAudioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(620, menuAudioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(420, menuAudioContext.currentTime + .045)
    gain.gain.setValueAtTime(.035, menuAudioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, menuAudioContext.currentTime + .055)
    oscillator.connect(gain).connect(menuAudioContext.destination)
    oscillator.start()
    oscillator.stop(menuAudioContext.currentTime + .06)
  } catch {}
}

function chooseCharacter(characterId) {
  if (state.screen !== 'character-select' || state.characterChoice) return
  state.characterChoice = characterId
  state.socket?.send(JSON.stringify({ type: 'character-choice', character: characterId }))
  render()
}

function startCharacterTimer() {
  if (state.characterTimerId) clearInterval(state.characterTimerId)
  state.characterTimeLeft = 45
  state.characterTimerId = setInterval(() => {
    state.characterTimeLeft -= 1
    const timer = document.querySelector('.character-select-timer')
    if (timer) timer.textContent = `${Math.max(0, state.characterTimeLeft)}s`
    if (state.characterTimeLeft <= 0) {
      clearInterval(state.characterTimerId)
      state.characterTimerId = null
      if (!state.characterChoice) chooseCharacter(Object.keys(characters)[Math.floor(Math.random() * Object.keys(characters).length)])
    }
  }, 1000)
}

async function uploadAdminVideo() {
  const upload = state.adminUpload
  if (!upload.file) { upload.status = 'Selecione um arquivo de vídeo.'; render(); return }
  upload.status = 'Enviando...'
  render()
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/upload?character=${upload.character}&ability=${upload.ability}`, {
      method: 'POST',
      headers: { 'Content-Type': upload.file.type || 'video/mp4', Authorization: `Bearer ${state.authToken}` },
      body: upload.file,
    })
    if (response.status === 401) {
      logoutAccount('Sua sessão expirou. Entre novamente.')
      return
    }
    if (!response.ok) {
      let reason = `Servidor respondeu ${response.status}.`
      try { reason = (await response.json()).error || reason } catch {}
      throw new Error(reason)
    }
    await loadVideoManifest()
    upload.status = 'Vídeo enviado com sucesso.'
    upload.file = null
  } catch (error) {
    upload.status = error.message || 'Erro ao enviar o vídeo.'
  }
  render()
}

async function uploadAdminIdleImage() {
  const idle = state.adminIdle
  if (!idle.file) { idle.status = 'Selecione uma imagem.'; render(); return }
  idle.status = 'Enviando...'
  render()
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/upload?character=${state.adminIdle.character}&ability=idle`, {
      method: 'POST',
      headers: { 'Content-Type': idle.file.type || 'image/png', Authorization: `Bearer ${state.authToken}` },
      body: idle.file,
    })
    if (response.status === 401) {
      logoutAccount('Sua sessão expirou. Entre novamente.')
      return
    }
    if (!response.ok) {
      let reason = `Servidor respondeu ${response.status}.`
      try { reason = (await response.json()).error || reason } catch {}
      throw new Error(reason)
    }
    await loadVideoManifest()
    idle.status = 'Imagem neutra enviada com sucesso.'
    idle.file = null
  } catch (error) {
    idle.status = error.message || 'Erro ao enviar a imagem.'
  }
  render()
}

async function uploadAdminIcon() {
  const icon = state.adminIcon
  if (!icon.file) { icon.status = 'Selecione uma imagem de ícone.'; render(); return }
  icon.status = 'Enviando...'
  render()
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/upload?character=${icon.character}&ability=icon`, {
      method: 'POST',
      headers: { 'Content-Type': icon.file.type || 'image/png', Authorization: `Bearer ${state.authToken}` },
      body: icon.file,
    })
    if (response.status === 401) {
      logoutAccount('Sua sessão expirou. Entre novamente.')
      return
    }
    if (!response.ok) {
      let reason = `Servidor respondeu ${response.status}.`
      try { reason = (await response.json()).error || reason } catch {}
      throw new Error(reason)
    }
    await loadVideoManifest()
    icon.status = 'Ícone enviado com sucesso.'
    icon.file = null
  } catch (error) {
    icon.status = error.message || 'Erro ao enviar o ícone.'
  }
  render()
}

async function openAdminAccess() {
  if (!state.authToken || state.currentUser?.role !== 'admin') {
    state.authError = 'Esta conta não possui acesso administrativo.'
    state.screen = 'auth'
    render()
    return
  }
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/admin/session`, { headers: { Authorization: `Bearer ${state.authToken}` } })
    if (!response.ok) throw new Error('expired')
    state.screen = state.screen === 'dashboard' ? 'admin' : 'dashboard'
  } catch {
    clearStoredSession()
    state.authError = 'Sua sessão expirou. Entre novamente.'
    state.screen = 'auth'
  }
  render()
}

async function authenticateAccount(event) {
  event.preventDefault()
  const username = document.querySelector('[data-auth-username]')?.value || ''
  const password = document.querySelector('[data-auth-password]')?.value || ''
  state.authLoading = true
  state.authError = ''
  render()
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/auth/${state.authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.')
    persistSession(result.token, result.user)
    state.screen = result.user.role === 'admin' ? 'dashboard' : 'home'
    await refreshWebUpdateNotice()
  } catch (error) {
    state.authError = error.message || 'Não foi possível autenticar.'
  } finally {
    state.authLoading = false
    render()
  }
}

function persistSession(token, user) {
  state.authToken = token
  state.currentUser = user
  localStorage.setItem('leet-auth-token', token)
  localStorage.setItem('leet-auth-user', JSON.stringify(user))
}

function clearStoredSession() {
  localStorage.removeItem('leet-auth-token')
  localStorage.removeItem('leet-auth-user')
  state.authToken = ''
  state.currentUser = null
}

async function logoutAccount(message = '') {
  if (state.authToken) fetch(`${MEDIA_BASE_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${state.authToken}` } }).catch(() => {})
  clearOnlineSession()
  clearStoredSession()
  state.authError = typeof message === 'string' ? message : ''
  state.screen = 'auth'
  render()
}

async function restoreSession() {
  if (!state.authToken) return
  try {
    const response = await fetch(`${MEDIA_BASE_URL}/auth/session`, { headers: { Authorization: `Bearer ${state.authToken}` } })
    if (!response.ok) throw new Error('expired')
    const { user } = await response.json()
    persistSession(state.authToken, user)
    state.screen = user.role === 'admin' ? 'dashboard' : 'home'
    await refreshWebUpdateNotice()
  } catch {
    clearStoredSession()
    state.authError = 'Sua sessão expirou. Entre novamente.'
    state.screen = 'auth'
  }
  render()
}

async function applyUpdate() {
  if (!state.updateManifest || state.updateInstalling) return
  state.updateInstalling = true
  state.updateStatus = ''
  state.updateProgress = 0
  state.updateDownloaded = 0
  state.updateTotal = 0
  render()
  const removeProgressListener = onDownloadProgress((progress) => {
    state.updateProgress = Number(progress.percent) || 0
    state.updateDownloaded = Number(progress.downloaded) || 0
    state.updateTotal = Number(progress.total) || 0
    render()
  })
  try {
    if (state.updateManifest.source === 'web') {
      state.updateStatus = 'Baixando atualização do jogo...'
      render()
      await installWebUpdate(state.updateManifest)
      state.updateAvailable = false
      state.updateInstalling = false
      window.location.reload()
      return
    }
    await installUpdate(state.updateManifest, (status) => { state.updateStatus = status; render() })
    removeProgressListener()
  } catch (error) {
    removeProgressListener()
    state.updateStatus = error.message || 'Não foi possível instalar a atualização.'
    state.updateInstalling = false
    render()
  }
}

async function refreshWebUpdateNotice() {
  const web = await checkWebUpdate()
  if (!web.available) return
  state.updateAvailable = true
  state.updateManifest = { ...web.manifest, source: 'web' }
  render()
}

async function checkForUpdateNow() {
  state.updateError = 'Verificando...'
  state.setupOpen = true
  render()

  // Conteúdo do jogo é atualizado sem reinstalar o aplicativo.
  const web = await checkWebUpdate()
  if (web.available) {
    state.updateAvailable = true
    state.updateManifest = { ...web.manifest, source: 'web' }
    state.updateError = ''
    render()
    return
  }

  const result = await checkForUpdate()
  state.updateError = result.available ? '' : (result.error || 'Você já está na versão mais recente.')
  if (result.available) {
    state.updateAvailable = true
    state.updateManifest = result.manifest
  }
  render()
}

function chooseAbility(phase, abilityId) {
  state.selections[phase] = abilityId
  if (state.online) {
    const ability = abilityId || 'basic'
    state.onlineWaiting = true
    state.socket?.send(JSON.stringify({ type: 'choose', turn: state.turn, ability }))
    render()
    return
  }
  if (state.phase === 'p1') {
    state.phase = 'p2'
    render()
    return
  }
  resolveTurn()
}

function skipTurn() {
  const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
  const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
  const player = state.players[activeIndex]
  if (player?.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn) return
  chooseAbility(phase, 'skip')
}

async function startGame() {
  const ids = [...document.querySelectorAll('[data-player]')].map((select) => select.value)
  state.players = ids.map((id) => createPlayer(characters[id]))
  state.screen = 'loading'; state.turn = 1; state.phase = 'p1'; state.selections = {}; state.log = []; state.result = ''; state.animation = null; state.online = false; state.onlineWaiting = false; state.opponentChosen = false
  state.lastTurnActions = [{ player: '', text: 'Aguardando escolhas' }, { player: '', text: 'Aguardando escolhas' }]
  state.hpDeltas = [null, null]
  state.videoQueue = []; state.videoPlaying = false
  render()
  await preloadBattleMedia()
  state.screen = 'battle'
  startTurnTimer()
  startMusic()
  render()
}

function startTurnTimer() {
  stopTurnTimer()
  state.turnTimeLeft = 40
  state.turnTimerId = setInterval(() => {
    state.turnTimeLeft -= 1
    const label = document.querySelector('.turn-timer')
    if (label) label.textContent = `${Math.max(0, state.turnTimeLeft)}s`
    if (state.turnTimeLeft <= 0) handleTurnTimeout()
  }, 1000)
}

function stopTurnTimer() {
  if (state.turnTimerId) clearInterval(state.turnTimerId)
  state.turnTimerId = null
}

function handleTurnTimeout() {
  stopTurnTimer()
  if (state.screen !== 'battle' || state.result) return
  if (state.online) {
    const phase = `p${state.playerIndex + 1}`
    if (!state.onlineWaiting) {
      const [player, opponent] = state.playerIndex === 0 ? state.players : [...state.players].reverse()
      chooseAbility(phase, randomAbilityId(player, opponent))
    }
    return
  }
  const [p1, p2] = state.players
  if (!state.selections.p1) state.selections.p1 = randomAbilityId(p1, p2)
  if (!state.selections.p2) state.selections.p2 = randomAbilityId(p2, p1)
  resolveTurn()
}

let bgmAudio = null

function startMusic() {
  if (state.musicEnabled && bgmAudio && !bgmAudio.paused) return
  if (!bgmAudio) {
    bgmAudio = new Audio('/assets/audio/bgm.mp3')
    bgmAudio.loop = true
    bgmAudio.volume = 0.16
  }
  bgmAudio.play().then(() => {
    state.musicEnabled = true
  }).catch(() => {
    state.musicEnabled = false
  })
}

function stopMusic() {
  state.musicEnabled = false
  if (bgmAudio) {
    bgmAudio.pause()
    bgmAudio.currentTime = 0
  }
}

function createPlayer(character) {
  return {
    character,
    name: character.name,
    title: character.title,
    accent: character.accent,
    hp: character.hp,
    maxHp: character.hp,
    rage: 0,
    markActive: false,
    markBasicHits: 0,
    markSource: null,
    friezaBasicHits: 0,
    friezaUses: character.id === 'cedric' ? 2 : 0,
    ruminationHits: 0,
    ruminationLastKind: null,
    uses: Object.fromEntries(character.abilities.filter((ability) => ability.uses !== undefined).map((ability) => [ability.id, ability.uses])),
    nextBasicBonus: 0,
    bonusExpiresTurn: 0,
    pendingPredatory: false,
    predatoryExpiresTurn: 0,
    forcedBasicTurns: 0,
    forcedBasicStartsTurn: 0,
    basicDamageBonusExpiresTurn: 0,
    blockedAbilityId: null,
    blockedAbilitySource: '',
    blockedAbilityUntilTurn: 0,
    forcedBasicBonus: 0,
    basicDamageBonus: 0,
    damonBasicHitsReceived: 0,
    resistanceStacks: 0,
    damageHistory: [],
    drainBonus: 0,
    drainAvailable: 0,
    harvestTurns: 0,
    harvestHealing: 0,
    noBasicTurns: 0,
    noDrainTurns: 0,
    noxMarks: 0,
    noxMarksApplied: 0,
    noxPressureCharges: 0,
    noxMarkLocked: false,
    brickDodges: 0,
    brickPunchesReceived: 0,
    brickKicksReceived: 0,
    brickCounterPunches: 0,
    nextTurnDodge: false,
    forcedBasicSource: '',
    sacrificeActive: false,
    damonResurrectionArmed: false,
    brokenLimitReady: false,
    noxReconstructionActive: false,
    zeroExperience: 0,
    zeroAnalysisArmed: false,
    zeroLevel: 1,
    hakuBasicStep: 0,
    hakuDefenseTurns: 0,
    hakuBladeDanceArmed: false,
    hakuBladeDanceResolvedTurn: 0,
    hakuDeepCutTurns: 0,
    hakuLastDanceActive: false,
    ogroGrabActive: false,
    ogroGrabbedTurns: 0,
    ogroRoarTurns: 0,
    forcedRandomTurns: 0,
    ogroForcedAbilityId: null,
    forcedSkipTurns: 0,
    forcedSkipReason: '',
    turnHealing: [],
    turnActionLabel: '',
    permanentBasicBonus: 0,
    ogroPantryBonusApplied: false,
    kiroReductionTurns: 0,
    kiroStrengthBonus: 0,
    kiroDoubleArmed: false,
    sanyAmplificationUntilTurn: 0,
    sanyResearchArmed: false,
    sanyResearchPrediction: '',
    sanyLastChanceUsed: false,
    sanyLuckyEarnedTurn: 0,
  }
}

function currentPlayerName() {
  return getPlayerNickname(state.currentUser?.username || 'Jogador')
}

// O chat geral reaproveita a conexão da lista de salas e reconecta se ela tiver caído.
function ensureChatSocket() {  const socket = state.roomFeedSocket
  if (socket && (socket.readyState === globalThis.WebSocket.OPEN || socket.readyState === globalThis.WebSocket.CONNECTING)) return
  state.roomFeedSocket = null
  state.roomFeedConnecting = false
  state.roomFeedConnected = false
  connectOnline('list')
}

// Redes móveis costumam bloquear portas altas, então tentamos a porta 443 antes do IP direto.
const socketEndpoints = ['wss://leetarena.tech/ws', 'ws://2.25.214.134:8787']
let socketEndpointIndex = 0
let socketEndpointWorking = false

function rotateSocketEndpoint() {
  if (socketEndpointWorking) return
  socketEndpointIndex = (socketEndpointIndex + 1) % socketEndpoints.length
}

function onlineSocketUrl() {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WS_URL : ''
  const runtimeUrl = globalThis.__LEET_WS_URL__ || ''
  const configured = envUrl || runtimeUrl
  if (configured) return configured

  if (Capacitor.isNativePlatform()) return socketEndpoints[socketEndpointIndex % socketEndpoints.length]

  if (typeof window !== 'undefined' && window.location?.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${window.location.host}/ws`
  }

  return 'ws://localhost:8787'
}

function connectOnline(mode, selectedCode = '') {
  if (mode === 'list') {
    if (state.roomFeedSocket && state.roomFeedSocket.readyState === globalThis.WebSocket.OPEN) return
    if (state.roomFeedSocket && state.roomFeedSocket.readyState === globalThis.WebSocket.CONNECTING) return
  }

  if (mode !== 'list') {
    if (state.socket && (state.socket.readyState === globalThis.WebSocket.OPEN || state.socket.readyState === globalThis.WebSocket.CONNECTING)) return
  }

  const character = document.querySelector(`[data-player="${mode === 'create' ? '0' : '1'}"]`)?.value ?? 'cedric'
  const code = selectedCode
  const name = currentPlayerName()
  if (mode !== 'list' && state.socket) {
    state.socket.intentionalClose = true
    state.socket.close()
  }
  if (mode !== 'list') state.socket = null
  state.roomFeedConnecting = mode === 'list'
  state.roomFeedConnected = false
  state.onlineError = ''
  if (mode !== 'list') startMusic()
  render()
  let socket
  try {
    const WebSocketClient = globalThis.WebSocket
    if (!WebSocketClient) throw new Error('WebSocket não disponível neste Android')
    socket = new WebSocketClient(onlineSocketUrl())
  } catch (error) {
    state.onlineError = `Não foi possível iniciar a conexão: ${error.message}`
    render()
    return
  }
  if (mode === 'list') state.roomFeedSocket = socket
  else state.socket = socket
  socket.addEventListener('open', () => {
    socketEndpointWorking = true
    if (mode === 'list') {
      state.roomFeedConnected = true
      socket.send(JSON.stringify({ type: 'list-rooms' }))
      socket.send(JSON.stringify({ type: 'general-chat-history' }))
      if (state.chatOpen) render()
      return
    }
    socket.send(JSON.stringify(mode === 'create' ? { type: 'create', token: state.authToken, character, name, avatar: getPlayerAvatar() } : { type: 'join', token: state.authToken, code, character, name, avatar: getPlayerAvatar() }))
  })
  socket.addEventListener('message', (event) => handleOnlineMessage(JSON.parse(event.data)))
  socket.addEventListener('error', () => { rotateSocketEndpoint(); if (mode === 'list') { state.roomFeedConnected = false; state.roomFeedConnecting = false } state.onlineError = ''; render() })
  socket.addEventListener('close', () => { if (mode === 'list') { state.roomFeedSocket = null; state.roomFeedConnected = false; state.roomFeedConnecting = false; if (state.chatOpen) render() } if (!socket.intentionalClose && mode !== 'list' && (!state.roomCode || state.screen === 'home')) { state.onlineError = ''; render() } })
  setTimeout(() => { if (socket.readyState === globalThis.WebSocket.CONNECTING) { rotateSocketEndpoint(); socket.close(); if (mode === 'list') state.roomFeedConnecting = false; state.onlineError = ''; render() } }, 8000)
}

async function handleOnlineMessage(message) {
  if (message.type === 'general-chat-history') { state.generalChatMessages = Array.isArray(message.messages) ? message.messages : []; if (state.chatOpen) render(); return }
  if (message.type === 'general-chat') { state.generalChatMessages = [...state.generalChatMessages, message.message].slice(-50); if (state.chatOpen && state.chatTab === 'general') render(); return }
  if (message.type === 'private-chat') { state.privateChatMessages = [...state.privateChatMessages, message.message].slice(-50); if (state.chatOpen && state.chatTab === 'private') render(); return }
  if (message.type === 'public-rooms') { state.publicRooms = message.rooms; state.roomFeedConnecting = false; state.roomFeedConnected = true; state.onlineError = ''; render(); return }
  if (message.type === 'error') { state.onlineError = message.message; state.socket?.close(); state.screen = 'home'; render(); return }
  if (message.type === 'room-created') { state.online = true; state.playerIndex = 0; state.roomCode = message.code; state.createdRoomCode = message.code; state.screen = 'home'; render(); return }
  if (message.type === 'room-ready') {
    state.online = true; state.roomCode = message.code; state.createdRoomCode = ''; state.turn = message.turn; state.playerIndex = message.index; state.players = message.players.sort((a, b) => a.index - b.index).map((player) => createPlayer(characters[player.character]))
    state.characterChoice = null; state.characterOpponentChosen = false; state.screen = 'character-select'; render(); startCharacterTimer(); return
  }
  if (message.type === 'character-choice-status' && message.index !== state.playerIndex) {
    state.characterOpponentChosen = true
    render()
    return
  }
  if (message.type === 'character-ready') {
    if (state.characterTimerId) clearInterval(state.characterTimerId)
    state.characterTimerId = null
    const ordered = message.players.sort((a, b) => a.index - b.index)
    state.onlinePlayerNames = ordered.map((player) => player.name || '')
    state.players = ordered.map((player) => createPlayer(characters[player.character]))
    state.lastTurnActions = [{ player: '', text: 'Aguardando escolhas' }, { player: '', text: 'Aguardando escolhas' }]
    state.hpDeltas = [null, null]
    state.phase = `p${state.playerIndex + 1}`; state.screen = 'loading'; render(); await preloadBattleMedia(); state.screen = 'battle'; startTurnTimer(); render(); return
  }
  if (message.type === 'choice-status' && message.index !== state.playerIndex) { state.opponentChosen = true; render(); return }
  if (message.type === 'resolve') {
    state.selections = { p1: message.choices[0], p2: message.choices[1] }
    state.onlineWaiting = false
    resolveTurn()
  }
  if (message.type === 'opponent-left') {
    if (state.screen === 'battle' && !state.result) recordMatchResult('win')
    state.onlineWaiting = false
    state.onlineError = 'Oponente saiu da partida.'
    state.createdRoomCode = ''
    state.privateChatMessages = []
    state.chatOpen = false
    state.screen = 'home'
    if (state.socket) {
      state.socket.intentionalClose = true
      state.socket.close()
      state.socket = null
    }
    render()
    return
  }
}

function confirmSelection() {
  if (state.online) {
    const phase = `p${state.playerIndex + 1}`
    const ability = state.selections[phase]
    if (!ability || state.onlineWaiting) return
    chooseAbility(phase, ability)
    return
  }
  if (state.phase === 'p1') { state.phase = 'p2'; render(); return }
  resolveTurn()
}

function resolveTurn() {
  const [p1, p2] = state.players
  const hpBefore = state.players.map((player) => player.hp)
  state.players.forEach((player, index) => {
    player.drainGainedThisTurn = false
    if (player.character?.id === 'nox' && state.turn % 5 === 0 && !player.noxMarkLocked) {
      const target = state.players[index === 0 ? 1 : 0]
      addNoxMark(player, target, 1)
    }
    if (player.character?.id === 'damon' && player.damonBasicHitsReceived >= 5) player.resurrectUnlocked = true
    if (player.character?.id === 'ogro' && state.turn > 22 && !player.ogroPantryBonusApplied) {
      player.ogroPantryBonusApplied = true
      player.permanentBasicBonus = (player.permanentBasicBonus || 0) + 500
    }
  })
  const a1 = resolveSelection(p1, state.selections.p1, p2)
  const a2 = resolveSelection(p2, state.selections.p2, p1)
  if (p1.character?.id === 'haku' && a1.kind === 'haku-dance' && a2.id === 'basic') p1.hakuBladeDanceArmed = true
  if (p2.character?.id === 'haku' && a2.kind === 'haku-dance' && a1.id === 'basic') p2.hakuBladeDanceArmed = true
  if (a1.id === 'basic' && a2.id === 'basic') {
    if (p1.character?.id === 'zero') p2.zeroBestCancelled = true
    if (p2.character?.id === 'zero') p1.zeroBestCancelled = true
  }
  p1.turnDamage = []
  p2.turnDamage = []
  p1.turnHealing = []
  p2.turnHealing = []
  p1.turnReceivedDamage = 0
  p2.turnReceivedDamage = 0
  p1.turnReceivedHealing = 0
  p2.turnReceivedHealing = 0
  p1.turnActionLabel = ''
  p2.turnActionLabel = ''
  const events = [`Turno ${state.turn}: ${p1.name} usou ${a1.name}${selectedAbilityId(state.selections.p1) !== a1.id ? ' (ação alterada).' : '.'}`, `Turno ${state.turn}: ${p2.name} usou ${a2.name}${selectedAbilityId(state.selections.p2) !== a2.id ? ' (ação alterada).' : '.'}`]
  const predatoryTriggers = new Set()
  if (triggerPredatory(p1, p2, a1, a2, events)) predatoryTriggers.add(p1)
  if (triggerPredatory(p2, p1, a2, a1, events)) predatoryTriggers.add(p2)
  applyAction(p1, p2, a1, a2, events, predatoryTriggers); applyAction(p2, p1, a2, a1, events, predatoryTriggers)
  updateKynPassives(p1, a2, events)
  updateKynPassives(p2, a1, events)
  state.hpDeltas = state.players.map((player) => {
    const damage = player.turnReceivedDamage || 0
    const heal = player.turnReceivedHealing || 0
    return damage || heal ? { damage, heal } : null
  })
  state.lastTurnActions = [
    { player: p1.name, text: formatActionText(p1, state.selections.p1, a1) },
    { player: p2.name, text: formatActionText(p2, state.selections.p2, a2) },
  ]
  state.log = [...events, ...state.log].slice(0, 12)
  state.result = p1.hp <= 0 && p2.hp <= 0 ? 'Empate: os dois personagens chegaram a 0 HP.' : p1.hp <= 0 ? `${p2.name} venceu o duelo.` : p2.hp <= 0 ? `${p1.name} venceu o duelo.` : ''
  if (state.result) {
    state.privateChatMessages = []
    state.chatOpen = false
  }
  if (state.result && state.online) {
    const youWon = state.playerIndex === 0 ? p2.hp <= 0 && p1.hp > 0 : p1.hp <= 0 && p2.hp > 0
    const youLost = state.playerIndex === 0 ? p1.hp <= 0 && p2.hp > 0 : p2.hp <= 0 && p1.hp > 0
    recordMatchResult(youWon ? 'win' : youLost ? 'loss' : 'draw')
  }
  enqueueTurnVideos(getVideoUrl(p1.character.id, a1.id), getVideoUrl(p2.character.id, a2.id))
  const cedricAttacker = shouldAnimateCedricBasic(p1, a1) ? 0 : shouldAnimateCedricBasic(p2, a2) ? 1 : -1
  state.animation = cedricAttacker === -1 ? null : { impact: false, targetIndex: cedricAttacker === 0 ? 1 : 0 }
  state.turn += 1; state.phase = 'p1'; state.selections = {}
  if (state.result) stopTurnTimer()
  else startTurnTimer()
  render()
}

function formatActionText(player, selectedId, ability) {
  const hits = (player.turnDamage || []).map((value) => `${value}💥`).join(' ')
  const heals = (player.turnHealing || []).map((value) => `+${value}💚`).join(' ')
  const label = player.turnActionLabel || ability.name
  const suffix = [hits, heals].filter(Boolean).join(' ')
  if (selectedId === 'skip' || ability.kind === 'skip') return suffix ? `pulou turno ${suffix}` : 'pulou turno'
  if (player.blockedAbilityId && ability.id === 'basic' && state.turn < player.blockedAbilityUntilTurn) return suffix ? `pulou turno ${suffix}` : 'pulou turno'
  if (ability.kind === 'foresight' && ability.predictedId) return `${ability.name}: ${ability.predictedName || ability.predictedId}`
  return suffix ? `${label} ${suffix}` : label
}

function shouldAnimateCedricBasic(player, ability) {
  return player.name === 'Cedric' && ability.id === 'basic'
}

function resolveSelection(player, selectedId, opponent) {
  if (player.forcedSkipTurns > 0) return { id: 'skip', name: 'Pulou turno', kind: 'skip' }
  if (player.ogroForcedAbilityId) {
    return player.character.abilities.find((item) => item.id === player.ogroForcedAbilityId) ?? player.character.abilities[0]
  }
  const forcedBasic = player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn
  if (selectedId === 'skip' && !forcedBasic) return { id: 'skip', name: 'Pulou turno', kind: 'skip' }
  const [abilityId, predictedId] = String(selectedId || '').split(':')
  let ability = player.character.abilities.find((item) => item.id === abilityId) ?? player.character.abilities[0]
  if (ability.kind === 'foresight' && predictedId) {
    const predicted = opponent.character.abilities.find((item) => item.id === predictedId)
    ability = { ...ability, predictedId, predictedName: predicted?.name || predictedId }
  }
  if (ability.kind === 'nox-pressure' && predictedId) {
    const target = opponent.character.abilities.find((item) => item.id === predictedId)
    ability = { ...ability, targetId: predictedId, targetName: target?.name || predictedId }
  }
  if (player.character?.id === 'haku' && player.hakuDefenseTurns > 0 && ability.id === 'basic') {
    return { id: 'skip', name: 'Pulou turno', kind: 'skip' }
  }
  if (player.character?.id === 'haku' && player.hakuDefenseTurns > 0 && ability.id !== 'deep-cut') {
    return { id: 'skip', name: 'Pulou turno', kind: 'skip' }
  }
  if (forcedBasic && ability.id !== 'basic' && player.hakuDefenseTurns <= 0) {
    ability = player.character.abilities.find((item) => item.id === 'basic') ?? ability
  }
  if (player.blockedAbilityId && ability.id === player.blockedAbilityId && state.turn < player.blockedAbilityUntilTurn) {
    if (player.blockedAbilitySource === 'pressure') return { id: 'skip', name: 'Pulou turno', kind: 'skip' }
    ability = player.character.abilities.find((item) => item.id === 'basic') ?? ability
  }
  return ability
}

function getAbility(player, id) { return player.character.abilities.find((ability) => ability.id === id) ?? player.character.abilities[0] }

function triggerPredatory(player, opponent, ability, opponentAbility, events) {
  const selectedPredatory = ability.kind === 'predatory'
  if ((!player.pendingPredatory && !selectedPredatory) || opponentAbility.id !== 'basic') return false
  player.pendingPredatory = false
  player.turnActionLabel = 'Ativou Ataque Predatório'
  if (selectedPredatory) consume(player, ability)
  player.turnDamage = [...(player.turnDamage || []), 160]
  dealDamage(opponent, 160, events, `${player.name} ativou o Ataque predatório e causou 160 de dano.`)
  const recoveredHp = healPlayer(player, 180, events)
  events.push(recoveredHp > 0 ? `${player.name} recuperou ${recoveredHp} HP.` : `${player.name} tentou recuperar 180 HP, mas já estava com o HP cheio.`)
  return true
}

function trackCedricFrieza(target, ability, events) {
  if (target.character?.id !== 'cedric' || target.friezaUses <= 0) return
  if (ability.id !== 'basic' || ability.kind !== 'damage') {
    target.friezaBasicHits = 0
    return
  }
  target.friezaBasicHits += 1
  if (target.friezaBasicHits >= 3) {
    target.friezaUses -= 1
    target.friezaBasicHits = 0
    const recovered = healPlayer(target, 300, events)
    events.push(`${target.name} ativou Frieza e recuperou ${recovered} HP.`)
  }
}

function trackVossRumination(target, ability, events) {
  if (target.character?.id !== 'voss') return
  const kind = ability.id === 'basic' ? 'basic' : ability.kind === 'skip' ? 'skip' : 'ability'
  target.ruminationHits = target.ruminationLastKind === kind ? target.ruminationHits + 1 : 1
  target.ruminationLastKind = kind
  if (target.ruminationHits >= 3) {
    target.rage += 15
    target.ruminationHits = 0
    target.ruminationLastKind = null
    events.push(`${target.name} ativou Ruminação e ganhou 15 de fúria.`)
  }
}

function recordDamage(target, amount) {
  target.damageHistory = [...(target.damageHistory || []), amount].slice(-11)
}

function healPlayer(player, amount, events) {
  if (player.hakuDeepCutTurns > 0) amount = Math.floor(amount * .5)
  const before = player.hp
  player.hp = Math.min(player.maxHp, player.hp + amount)
  const healed = player.hp - before
  if (healed > 0) {
    player.turnHealing = [...(player.turnHealing || []), healed]
    player.turnReceivedHealing = (player.turnReceivedHealing || 0) + healed
    recordOpponentHealing(player, healed, events)
  }
  return healed
}

function recordOpponentHealing(healedPlayer, amount, events) {
  state.players.forEach((player) => {
    if (player === healedPlayer || player.character?.id !== 'kyn' || player.harvestTurns <= 0) return
    player.harvestHealing += amount
    events.push(`${player.name} registrou ${amount} de cura com Colheita.`)
  })
}

function addKynDrain(player, amount, events, message, replace = false) {
  if (player.character?.id !== 'kyn' || amount <= 0) return
  player.drainAvailable = replace ? amount : player.drainAvailable + amount
  player.drainGainedThisTurn = true
  player.noDrainTurns = 0
  if (message) events.push(message)
}

function updateKynPassives(player, opponentAbility, events) {
  if (player.character?.id !== 'kyn') return
  if (opponentAbility.id === 'basic') player.noBasicTurns = 0
  else {
    player.noBasicTurns += 1
    if (player.noBasicTurns >= 3) {
      addKynDrain(player, 100, events, `${player.name} ativou Paciência e ganhou 100 de Dreno.`)
      player.noBasicTurns = 0
    }
  }
  if (player.drainGainedThisTurn) return
  player.noDrainTurns += 1
  if (player.noDrainTurns >= 3) {
    addKynDrain(player, 200, events, `${player.name} ativou Tributo e ganhou 200 de Dreno.`)
    player.hp = Math.max(1, player.hp - 150)
    player.noDrainTurns = 0
  }
}

function receiveDamage(target, amount, events, message) {
  if (target.nextTurnDodge && amount > 0) {
    target.nextTurnDodge = false
    target.brickDodges += 1
    events.push(`${target.name} esquivou o ataque.`)
    return false
  }
  let damage = amount
  if (target.character?.id === 'haku' && target.hakuDefenseTurns > 0) damage = Math.floor(damage * .45)
  if (target.character?.id === 'ogro' && target.ogroRoarTurns > 0) damage = Math.floor(damage * .7)
  if (target.character?.id === 'kiro' && target.kiroReductionTurns > 0) damage = Math.floor(damage * .7)
  if (target.character?.id === 'damon' && target.resistanceStacks > 0) damage = Math.max(0, damage - target.resistanceStacks * 5)
  if (target.character?.id === 'brick' && target.character?.id === 'brick' && target.resistanceStacks > 0) damage = Math.max(0, damage - target.resistanceStacks * 5)
  recordDamage(target, damage)
  target.turnReceivedDamage = (target.turnReceivedDamage || 0) + damage
  target.hp = Math.max(0, target.hp - damage)
  if (target.character?.id === 'damon') target.resistanceStacks = Math.floor((target.maxHp - target.hp) / 200)
  if (target.hp <= 0 && target.secondLifeArmed) {
    target.secondLifeArmed = false
    target.hp = 1
    addKynDrain(target, 200, events, `${target.name} ganhou 200 de Dreno com Sobrevida.`)
    events.push(`${target.name} ativou Sobrevida e ficou com 1 HP.`)
  }
  if (target.hp <= 0 && target.character?.id === 'sany' && !target.sanyLastChanceUsed) {
    target.sanyLastChanceUsed = true
    target.hp = 1
    target.uses['lucky-attack'] += 1
    events.push(`${target.name} ativou Última chance e ganhou 1 uso de Ataque de sorte.`)
  }
  if (target.hp <= 0 && target.character?.id === 'damon' && target.damonBasicHitsReceived >= 5) {
    getDamonResurrection(target, events)
  }
  events.push(message.replace(String(amount), String(damage)))
  return true
}

function getDamonResurrection(target, events) {
  if (target.character?.id !== 'damon' || !target.damonResurrectionArmed) return false
  target.damonResurrectionArmed = false
  target.resurrectUnlocked = false
  target.turnActionLabel = 'Ativou Ressuscitar'
  healPlayer(target, 500, events)
  target.permanentBasicBonus = (target.permanentBasicBonus || 0) + 60
  events.push(`${target.name} ressuscitou com 500 HP e ganhou +60 de dano básico permanente.`)
  return true
}

const zeroAttackValues = [45, 75, 120, 170, 265]
const zeroExperienceThresholds = [0, 50, 130, 250, 340]
const hakuAttackValues = [30, 60, 90, 120, 150]

function updateZeroLevel(player) {
  if (player.character?.id !== 'zero') return
  player.zeroLevel = zeroExperienceThresholds.reduce((level, threshold, index) => player.zeroExperience >= threshold ? index + 1 : level, 1)
}

function addZeroExperience(player, amount, events) {
  if (player.character?.id !== 'zero') return
  const oldLevel = player.zeroLevel
  player.zeroExperience += amount
  updateZeroLevel(player)
  events.push(`${player.name} ganhou ${amount} de experiência.`)
  if (player.zeroLevel > oldLevel) events.push(`${player.name} evoluiu para o nível ${player.zeroLevel}.`)
}

function addNoxMark(player, opponent, amount, events) {
  if (player.character?.id !== 'nox' || !opponent || opponent.noxMarks >= 10) {
    if (opponent?.noxMarks >= 10) player.noxMarkLocked = true
    return 0
  }
  const beforeAppliedGroup = Math.floor((player.noxMarksApplied || 0) / 10)
  const added = Math.min(amount, 10 - opponent.noxMarks)
  opponent.noxMarks += added
  player.noxMarksApplied += added
  const afterAppliedGroup = Math.floor(player.noxMarksApplied / 10)
  if (afterAppliedGroup > beforeAppliedGroup) player.noxPressureCharges += (afterAppliedGroup - beforeAppliedGroup) * 2
  if (opponent.noxMarks >= 10) player.noxMarkLocked = true
  if (events && added > 0) events.push(`${player.name} aplicou ${added} marca${added > 1 ? 's' : ''}.`)
  return added
}

function getBasicDamage(player) {
  if (player.character?.id === 'zero') return zeroAttackValues[player.zeroLevel - 1] || 45
  if (player.character?.id === 'haku') return hakuAttackValues[player.hakuBasicStep] || 30
  return player.character.abilities.find((ability) => ability.id === 'basic')?.damage || 0
}

function nextHakuHit(player) {
  const damage = hakuAttackValues[player.hakuBasicStep] || 30
  player.hakuBasicStep = (player.hakuBasicStep + 1) % hakuAttackValues.length
  return damage
}

function takeHakuHits(player, count) {
  return Array.from({ length: count }, () => nextHakuHit(player))
}

function finishHakuBasic(player) {
  if (player.character?.id !== 'haku') return
  player.hakuBasicStep = (player.hakuBasicStep + 1) % 5
}

function applyAction(player, opponent, ability, opponentAbility, events, predatoryTriggers) {
  if (player.nextBasicBonus && state.turn > player.bonusExpiresTurn) player.nextBasicBonus = 0
  const predatoryReady = player.pendingPredatory && state.turn === player.predatoryExpiresTurn
  if (player.pendingPredatory && state.turn >= player.predatoryExpiresTurn && !predatoryReady) player.pendingPredatory = false
  if (player.basicDamageBonus && state.turn > player.basicDamageBonusExpiresTurn) player.basicDamageBonus = 0
  const forcedBasicThisTurn = player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn
  if (player.blockedAbilityId && state.turn >= player.blockedAbilityUntilTurn) {
    player.blockedAbilityId = null
    player.blockedAbilitySource = ''
    player.blockedAbilityUntilTurn = 0
  }
  if (predatoryTriggers.has(player)) return
  if (opponent.character?.id === 'sany' && opponent.sanyResearchArmed) {
    if (ability.id === opponent.sanyResearchPrediction) {
      opponent.uses['lucky-attack'] += 1
      events.push(`${opponent.name} acertou a Pesquisa e ganhou 1 uso de Ataque de sorte.`)
    }
    opponent.sanyResearchArmed = false
    opponent.sanyResearchPrediction = ''
  }
  if (player.zeroBestCancelled) {
    player.zeroBestCancelled = false
    player.turnDamage = [...(player.turnDamage || []), 0]
    addZeroExperience(opponent, 30, events)
    events.push(`${player.name} teve o ataque básico anulado por Sou o melhor! e causou 0 de dano.`)
    return
  }
  if (player.character?.id === 'zero' && player.zeroAnalysisArmed) {
    if (ability.kind !== 'damage') addZeroExperience(player, 30, events)
    player.zeroAnalysisArmed = false
  }
  if (player.character?.id === 'haku' && player.hakuDefenseTurns > 0 && ability.id === 'basic') return
  if (ability.kind === 'damage') {
    const hakuHits = player.character?.id === 'haku' && ability.id === 'basic' ? takeHakuHits(player, player.hakuLastDanceActive ? 2 : 1) : []
    const kynDrainDamage = player.character?.id === 'kyn' && ability.id === 'basic' ? player.drainAvailable : 0
    const baseDamage = hakuHits.length ? hakuHits.reduce((sum, value) => sum + value, 0) : ability.id === 'basic' ? getBasicDamage(player) + (player.permanentBasicBonus || 0) : ability.damage
    const bonusParts = [player.nextBasicBonus, forcedBasicThisTurn ? (player.forcedBasicBonus || 100) : 0, player.basicDamageBonus || 0, kynDrainDamage].filter((value) => value > 0)
    let damage = baseDamage + bonusParts.reduce((sum, value) => sum + value, 0)
    if (player.character?.id === 'kiro' && ability.id === 'basic') damage += player.kiroStrengthBonus
    if (player.character?.id === 'sany' && ability.id === 'basic' && opponent.hp > player.hp) damage += 80
    if (player.character?.id === 'sany' && player.sanyAmplificationUntilTurn >= state.turn) damage = Math.floor(damage * 1.25)
    if (player.character?.id === 'damon' && player.damonBasicHitsReceived >= 0) damage += player.damonBasicBonus || 0
    const dodgeTarget = opponent.character?.id === 'brick' && opponent.nextTurnDodge
    if (dodgeTarget) {
      opponent.nextTurnDodge = false
      opponent.brickDodges += 1
      events.push(`${opponent.name} esquivou o ataque.`)
      trackVossRumination(opponent, ability, events)
      return
    }
    let markBonus = 0
    player.nextBasicBonus = 0
    player.damonBasicBonus = 0
    if (player.character?.id === 'haku' && player.hakuDefenseTurns > 0) return
    const isCedricBasic = player.name === 'Cedric' && ability.id === 'basic'
    const hasMarkedDebuff = opponent.markActive && opponent.markSource === 'cedric'
    if (isCedricBasic && hasMarkedDebuff) {
      opponent.markBasicHits += 1
      if (opponent.markBasicHits >= 2) {
        markBonus = 270
        opponent.markActive = false
        opponent.markBasicHits = 0
        opponent.markSource = null
        events.push(`${player.name} detonou a marca em ${opponent.name} e causou 270 de dano extra.`)
      } else {
        events.push(`${player.name} acumulou marca em ${opponent.name}: ${opponent.markBasicHits}/2.`)
      }
    }
    const luckBonus = player.character?.id === 'kiro' && ability.id === 'basic' && Math.random() < .3 ? 100 : 0
    const displayedDamage = hakuHits.length ? hakuHits : ability.id === 'basic' ? [baseDamage, ...bonusParts] : [damage]
    player.turnDamage = [...(player.turnDamage || []), ...displayedDamage, ...(markBonus ? [markBonus] : []), ...(luckBonus ? [luckBonus] : [])]
    const totalDamage = damage + markBonus
    if (ability.uses !== undefined) consume(player, ability)
    const hit = dealDamage(opponent, totalDamage + luckBonus, events, `${player.name} causou ${totalDamage + luckBonus} de dano.`)
    if (hit && opponent.character?.id === 'brick') {
      if (ability.damageType === 'punch') opponent.brickPunchesReceived += 1
      if (ability.damageType === 'kick') opponent.brickKicksReceived += 1
    }
    if (luckBonus) events.push(`${player.name} ativou Sorte e causou 100 de dano extra.`)
    if (player.character?.id === 'kiro' && ability.id === 'basic' && player.kiroDoubleArmed) {
      player.kiroDoubleArmed = false
      player.turnDamage.push(damage)
      dealDamage(opponent, damage, events, `${player.name} repetiu o ataque com Ataque duplo e causou ${damage} de dano.`)
    }
    if (player.character?.id === 'kiro' && ability.id === 'basic') player.kiroStrengthBonus = 0
    if (player.character?.id === 'zero' && opponent.hp < player.hp) healPlayer(player, Math.floor(totalDamage * .2), events)
    if (opponent.character?.id === 'haku' && opponent.hakuBladeDanceArmed && ability.id === 'basic') {
      opponent.hakuBladeDanceArmed = false
      opponent.hakuBladeDanceResolvedTurn = state.turn
      const danceHits = takeHakuHits(opponent, opponent.hakuLastDanceActive ? 4 : 2)
      opponent.turnDamage = [...(opponent.turnDamage || []), ...danceHits]
      const danceDamage = danceHits.reduce((sum, value) => sum + value, 0)
      dealDamage(player, danceDamage, events, `${opponent.name} executou Dança da lâmina e causou ${danceHits.map((value) => `${value} de dano`).join(' + ')}.`)
    }
    if (player.character?.id === 'kyn' && kynDrainDamage > 0 && hit) {
      const healed = Math.floor(kynDrainDamage * .75)
      healPlayer(player, healed, events)
      player.drainAvailable = 0
      player.drainGainedThisTurn = true
      player.noDrainTurns = 0
    }
    if (opponent.character?.id === 'damon' && ability.id === 'basic') {
      opponent.damonBasicHitsReceived += 1
      if (opponent.damonBasicHitsReceived >= 5) opponent.resurrectUnlocked = true
    }
    if (opponent.character?.id === 'brick' && ability.id === 'basic' && Math.random() < .5) {
      player.hp = Math.max(0, player.hp - 25)
      player.turnDamage = [...(opponent.turnDamage || []), 25]
      events.push(`${opponent.name} ativou Contra-Golpe e acertou um Soco adicional.`)
    }
    trackCedricFrieza(opponent, ability, events)
  } else if (ability.kind === 'predatory') { player.pendingPredatory = true; player.predatoryExpiresTurn = state.turn + 1; consume(player, ability); events.push(`${player.name} armou o Ataque predatório para o próximo turno.`) }
  else if (ability.kind === 'analysis') { player.zeroAnalysisArmed = true; events.push(`${player.name} analisará a próxima habilidade.`) }
  else if (ability.kind === 'zero-evolution' || ability.kind === 'zero-survival' || ability.kind === 'haku-last-dance' || ability.kind === 'haku-concentration') { events.push(`${player.name} manteve sua passiva ativa.`) }
  else if (ability.kind === 'zero-best') { consume(player, ability); events.push(`${player.name} preparou Sou o melhor!`) }
  else if (ability.kind === 'haku-defense') { player.hakuDefenseTurns = 3; consume(player, ability); events.push(`${player.name} entrou em Postura Defensiva.`) }
  else if (ability.kind === 'haku-dance') { if (player.hakuBladeDanceResolvedTurn !== state.turn) player.hakuBladeDanceArmed = true; events.push(`${player.name} preparou Dança da lâmina.`) }
  else if (ability.kind === 'haku-deep-cut') { opponent.hakuDeepCutTurns = 5; consume(player, ability); events.push(`${player.name} aplicou Corte Profundo.`) }
  else if (ability.kind === 'mark') {
    opponent.markActive = true
    opponent.markBasicHits = 0
    opponent.markSource = 'cedric'
    consume(player, ability)
    events.push(`${player.name} marcou ${opponent.name}.`)
  }
  else if (ability.kind === 'execute') { consume(player, ability); if (opponent.hp <= opponent.maxHp * 0.25) { opponent.hp = 0; events.push(`${player.name} executou ${opponent.name}.`) } else events.push('Execução! falhou: o alvo ainda está acima de 25% de HP.') }
  else if (ability.kind === 'rage') { player.rage += state.turn > 10 ? 20 : 10; events.push(`${player.name} ganhou ${state.turn > 10 ? 20 : 10} de fúria.`) }
  else if (ability.kind === 'impulse') { player.rage -= 55; player.nextBasicBonus = 250; player.bonusExpiresTurn = state.turn + 1; events.push(`${player.name} concentrou +250 de dano no próximo ataque básico.`) }
  else if (ability.kind === 'heal') { player.rage -= 30; const recovered = healPlayer(player, 250, events); events.push(`${player.name} recuperou ${recovered} HP. HP atual: ${player.hp}.`) }
  else if (ability.kind === 'sacrifice') { player.hp = Math.max(1, player.hp - 200); player.damonBasicBonus = 200; player.sacrificeActive = true; events.push(`${player.name} sacrificou 200 HP para ganhar +200 no próximo ataque básico.`) }
  else if (ability.kind === 'resurrect') { if (player.resurrectUnlocked) { player.damonResurrectionArmed = true; consume(player, ability); events.push(`${player.name} ativou Ressuscitar. Se morrer, renascerá com 500 HP.`) } else events.push(`${player.name} ainda não recebeu 5 ataques básicos.`) }
  else if (ability.kind === 'taunt') { opponent.forcedBasicTurns = 1; opponent.forcedBasicStartsTurn = state.turn + 1; opponent.forcedBasicBonus = ability.tauntBonus || 70; opponent.forcedBasicSource = ability.tauntBonus === 150 ? 'provoke' : 'pain-hunger'; events.push(`${player.name} provocou ${opponent.name}.`) }
  else if (ability.kind === 'broken-limit') { if (state.turn > 11) { const damage = Math.floor((player.damageHistory || []).reduce((sum, value) => sum + value, 0) * .45); dealDamage(opponent, damage, events, `${player.name} rompeu o limite e causou ${damage} de dano.`); player.brokenLimitReady = false; consume(player, ability) } }
  else if (ability.kind === 'resistance') { player.resistanceStacks += 1; events.push(`${player.name} fortaleceu sua Resistência.`) }
  else if (ability.kind === 'foresight') { if (ability.predictedId === opponentAbility.id) addKynDrain(player, 125, events, `${player.name} acertou Premonição e carregou 125 de Dreno.`, true); else events.push(`${player.name} errou Premonição.`) }
  else if (ability.kind === 'harvest') { player.harvestTurns = 4; player.harvestHealing = 0; consume(player, ability); events.push(`${player.name} ativou Colheita.`) }
  else if (ability.kind === 'second-life') { player.secondLifeArmed = true; consume(player, ability); events.push(`${player.name} preparou Sobrevida.`) }
  else if (ability.kind === 'patience' || ability.kind === 'tribute') { events.push(`${player.name} manteve sua passiva ativa.`) }
  else if (ability.kind === 'nox-mark') { if (!player.noxMarkLocked) addNoxMark(player, opponent, 1, events); else events.push(`${player.name} atingiu o limite de 10 marcas e precisa usar Acionador.`) }
  else if (ability.kind === 'nox-trigger') { const damage = opponent.noxMarks * 60; opponent.noxMarks = 0; player.noxMarkLocked = false; player.turnDamage = [...(player.turnDamage || []), damage]; dealDamage(opponent, damage, events, `${player.name} acionou as marcas e causou ${damage} de dano.`) }
  else if (ability.kind === 'nox-pressure') { if (player.noxPressureCharges > 0 && ability.targetId) { player.noxPressureCharges -= 1; opponent.blockedAbilityId = ability.targetId; opponent.blockedAbilitySource = 'pressure'; opponent.blockedAbilityUntilTurn = state.turn + 2; events.push(`${player.name} ativou Pressão e bloqueou ${ability.targetName || ability.targetId} de ${opponent.name} por 1 turno.`) } }
  else if (ability.kind === 'nox-reconstruction') { player.noxReconstructionActive = opponent.noxMarks >= 8; events.push(`${player.name} ativou Reconstrução.`) }
  else if (ability.kind === 'nox-progression') { if (state.turn % 5 === 0) opponent.noxMarks += 1; events.push(`${player.name} verificou Progressão.`) }
  else if (ability.kind === 'counter') { events.push(`${player.name} preparou Contra-Golpe.`) }
  else if (ability.kind === 'retaliation') { if (player.brickDodges >= 2 && player.brickPunchesReceived >= 6 && player.brickKicksReceived >= 2) { dealDamage(opponent, 700, events, `${player.name} ativou Retaliação e causou 700 de dano.`); player.uses = Object.fromEntries(player.character.abilities.filter((item) => item.uses !== undefined).map((item) => [item.id, item.uses])); player.brickDodges = 0; player.brickPunchesReceived = 0; player.brickKicksReceived = 0 } }
  else if (ability.kind === 'dodge') { player.nextTurnDodge = true; consume(player, ability); events.push(`${player.name} preparou uma Esquiva.`) }
  else if (ability.kind === 'bindings') { opponent.forcedBasicTurns = 2; opponent.forcedBasicStartsTurn = state.turn + 1; opponent.basicDamageBonus = 100; opponent.basicDamageBonusExpiresTurn = state.turn + 3; consume(player, ability); events.push(`${player.name} amarrou ${opponent.name}: ele será forçado a usar 2 ataques básicos nos próximos 2 turnos e receberá +100 em cada um.`) }
  else if (ability.kind === 'deny') { player.rage -= 25; const candidate = opponent.character.abilities.find((item) => item.id === state.denyTargetAbilityId && item.id !== 'basic' && item.kind !== 'rage') || opponent.character.abilities.find((item) => item.id !== 'basic' && item.kind !== 'rage'); if (candidate) { opponent.blockedAbilityId = candidate.id; opponent.blockedAbilitySource = 'denial'; opponent.blockedAbilityUntilTurn = state.turn + 3; events.push(`${player.name} negou ${candidate.name} de ${opponent.name} pelos próximos 2 turnos.`) } else { events.push(`${player.name} tentou negar, mas ${opponent.name} não tinha habilidade ativa para bloquear.`) } state.denyTargetAbilityId = '' }
  else if (ability.kind === 'ogro-grab') { opponent.ogroGrabbedTurns = 5; player.ogroGrabActive = true; consume(player, ability); events.push(`${player.name} agarrou ${opponent.name} pelo pescoço.`) }
  else if (ability.kind === 'ogro-squeeze') { if (player.ogroGrabActive) dealDamage(opponent, 50, events, `${player.name} apertou ${opponent.name} e causou 50 de dano.`) }
  else if (ability.kind === 'ogro-release') { player.ogroGrabActive = false; opponent.ogroGrabbedTurns = 0; opponent.ogroForcedAbilityId = null; events.push(`${player.name} soltou ${opponent.name}.`) }
  else if (ability.kind === 'ogro-kick') { opponent.forcedSkipTurns = 1; opponent.forcedSkipReason = 'kick'; consume(player, ability); events.push(`${player.name} chutou ${opponent.name} para fora da arena.`) }
  else if (ability.kind === 'ogro-roar') { player.ogroRoarTurns = 2; consume(player, ability); events.push(`${player.name} rugiu e reduziu o dano recebido.`) }
  else if (ability.kind === 'ogro-throw') { opponent.forcedRandomTurns = 1; consume(player, ability); events.push(`${player.name} jogou ${opponent.name} para o alto.`) }
  else if (ability.kind === 'kiro-reduction') { player.kiroReductionTurns = 2; consume(player, ability); events.push(`${player.name} ativou Redução de dano.`) }
  else if (ability.kind === 'kiro-strengthen') { player.kiroStrengthBonus += 100; consume(player, ability); events.push(`${player.name} fortaleceu o próximo ataque básico.`) }
  else if (ability.kind === 'kiro-disrupt') { opponent.forcedSkipTurns = 1; opponent.forcedSkipReason = 'disrupt'; consume(player, ability); events.push(`${player.name} atrapalhou ${opponent.name}.`) }
  else if (ability.kind === 'kiro-double') { player.kiroDoubleArmed = true; consume(player, ability); events.push(`${player.name} preparou Ataque duplo.`) }
  else if (ability.kind === 'sany-lucky') { const damage = Math.floor(200 + Math.random() * 451); const amplified = player.sanyAmplificationUntilTurn >= state.turn ? Math.floor(damage * 1.25) : damage; player.turnDamage = [...(player.turnDamage || []), amplified]; consume(player, ability); dealDamage(opponent, amplified, events, `${player.name} usou Ataque de sorte e causou ${amplified} de dano.`) }
  else if (ability.kind === 'sany-amplify') { player.sanyAmplificationUntilTurn = state.turn + 1; consume(player, ability); events.push(`${player.name} ativou Amplificação.`) }
  else if (ability.kind === 'sany-research') { player.sanyResearchArmed = true; player.sanyResearchPrediction = randomAbilityId(opponent, player); consume(player, ability); events.push(`${player.name} iniciou Pesquisa.`) }
  else if (ability.kind === 'skip') { const recovered = player.character?.id === 'haku' ? healPlayer(player, 50, events) : 0; events.push(recovered > 0 ? `${player.name} pulou turno e ativou Concentração, recuperando ${recovered} HP.` : `${player.name} pulou turno.`) }
  trackVossRumination(opponent, ability, events)
  if (ability.kind !== 'damage') trackCedricFrieza(opponent, ability, events)
  if (player.harvestTurns > 0) {
    player.harvestTurns -= 1
    if (player.harvestTurns === 0) {
      addKynDrain(player, player.harvestHealing, events, player.harvestHealing > 0 ? `${player.name} converteu ${player.harvestHealing} de cura em Dreno com Colheita.` : '')
      player.harvestHealing = 0
    }
  }
  if (forcedBasicThisTurn) {
    player.forcedBasicTurns -= 1
    if (player.forcedBasicTurns <= 0) player.forcedBasicSource = ''
  }
  if (player.hakuDefenseTurns > 0 && ability.kind !== 'haku-defense') player.hakuDefenseTurns -= 1
  if (player.hakuDeepCutTurns > 0) player.hakuDeepCutTurns -= 1
  player.hakuLastDanceActive = player.character?.id === 'haku' && player.hp < player.maxHp * .55
  if (player.ogroGrabbedTurns > 0) player.ogroGrabbedTurns -= 1
  if (player.forcedRandomTurns > 0) player.forcedRandomTurns -= 1
  if (player.forcedSkipTurns > 0) player.forcedSkipTurns -= 1
  if (player.ogroGrabbedTurns > 0 || player.forcedRandomTurns > 0) {
    player.ogroForcedAbilityId = randomAbilityId(player, opponent)
  } else {
    player.ogroForcedAbilityId = null
  }
  if (player.ogroRoarTurns > 0) player.ogroRoarTurns -= 1
  if (player.kiroReductionTurns > 0) player.kiroReductionTurns -= 1
  if (player.character?.id === 'sany' && state.turn % 7 === 0 && player.sanyLuckyEarnedTurn !== state.turn) {
    player.uses['lucky-attack'] += 1
    player.sanyLuckyEarnedTurn = state.turn
  }
  if (player.character?.id === 'cedric' && ability.id !== 'basic' && opponent.markActive && opponent.markSource === 'cedric') opponent.markBasicHits = 0
}

function consume(player, ability) { if (ability.uses !== undefined) player.uses[ability.id] -= 1 }
function dealDamage(target, damage, events, message) { return receiveDamage(target, damage, events, message) }

render()
loadVideoManifest()
restoreSession()

checkForUpdate().then((result) => {
  state.updateError = result.available ? '' : (result.error || '')
  if (result.available) {
    state.updateAvailable = true
    state.updateManifest = result.manifest
    if (state.screen === 'home') render()
  }
})

getInstalledVersion().then((info) => {
  if (info?.versionName) {
    state.appVersionName = info.versionName
    if (state.screen === 'home') render()
  }
})