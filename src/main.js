import './style.css'

const characters = {
  cedric: {
    id: 'cedric', name: 'Cedric', title: 'O Predador', hp: 1300, accent: '#ff6b45',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: '65 de dano · ilimitado', kind: 'damage', damage: 65 },
      { id: 'predatory', name: 'Ataque predatório', detail: '160 de dano + recupera 180 HP se sofrer ataque básico no próximo turno · 3 usos', kind: 'predatory', uses: 3 },
      { id: 'mark', name: 'Marcar alvo', detail: 'Marca o oponente; após 2 ataques básicos consecutivos, causa +270 · 2 usos', kind: 'mark', uses: 2 },
      { id: 'execute', name: 'Execução!', detail: 'Executa o alvo com 25% de HP ou menos · 1 uso', kind: 'execute', uses: 1 },
      { id: 'bindings', name: 'Amarras', detail: 'Força 2 ataques básicos do oponente nos próximos 2 turnos e concede +100 de dano no ataque básico deles · 3 usos', kind: 'bindings', uses: 3 },
    ],
  },
  voss: {
    id: 'voss', name: 'Voss', title: 'O Furioso', hp: 1200, accent: '#79d6c2',
    abilities: [
      { id: 'basic', name: 'Ataque básico', detail: '75 de dano · ilimitado', kind: 'damage', damage: 75 },
      { id: 'rage', name: 'Aumentar fúria', detail: '+10 de fúria; após o 10º turno, +20 · ilimitado', kind: 'rage' },
      { id: 'impulse', name: 'Impulso', detail: '+250 no próximo ataque básico · custa 55 de fúria', kind: 'impulse' },
      { id: 'heal', name: 'Cura', detail: 'Recupera 250 HP · custa 30 de fúria', kind: 'heal' },
      { id: 'denial', name: 'Negação', detail: 'Bloqueia 1 habilidade ativa do oponente por 2 turnos · custa 25 de fúria', kind: 'deny' },
    ],
  },
}

const state = {
  screen: 'home', players: [], turn: 1, phase: 'p1', selections: {}, log: [], result: '', animation: null,
  online: false, socket: null, roomCode: '', playerIndex: 0, onlineWaiting: false, onlineError: '', publicRooms: [],
  lastTurnActions: [{ player: '', text: 'Aguardando escolhas' }, { player: '', text: 'Aguardando escolhas' }],
}

const app = document.querySelector('#app')

function render() {
  document.body.className = state.screen === 'battle' ? 'battle-view' : 'home-view'
  app.innerHTML = state.screen === 'home' ? renderHome() : state.screen === 'lobby' ? renderLobby() : renderBattle()
  bindEvents()
}

function renderLobby() {
  return `<section class="home-shell lobby-shell"><div class="brand-mark"><span>LA</span><small>LEET ARENA</small></div><div class="home-copy"><p class="eyebrow">SALA ONLINE</p><h1>${state.roomCode}</h1><p class="intro">Compartilhe este código com o outro jogador. A partida começa quando os dois entrarem.</p></div><div class="setup-panel"><div class="panel-label">AGUARDANDO OPONENTE</div><p class="online-wait">● CONEXÃO ATIVA<br><small>Servidor aguardando o segundo jogador.</small></p><button class="primary-button" data-action="cancel-online">CANCELAR SALA <span>↗</span></button></div></section>`
}

function renderHome() {
  return `<section class="home-shell">
    <div class="brand-mark"><span>LA</span><small>LEET ARENA</small></div>
    <div class="home-copy">
      <p class="eyebrow">PROTOCOLO DE COMBATE // 01</p>
      <h1>Escolha.<br><em>Revele.</em><br>Sobreviva.</h1>
      <p class="intro">Um duelo local por turnos simultâneos. As escolhas ficam ocultas até o momento do impacto.</p>
    </div>
    <div class="setup-panel">
      <div class="panel-label">CONFIGURAR DUELO</div>
      ${playerPicker(0, 'JOGADOR 1', 'cedric')}
      <div class="versus">VS</div>
      ${playerPicker(1, 'JOGADOR 2', 'voss')}
      <button class="primary-button" data-action="start">INICIAR PARTIDA <span>↗</span></button>
      <div class="online-box"><p class="panel-label">SALAS PÚBLICAS</p><button class="primary-button small" data-action="create-online">CRIAR SALA</button><button class="primary-button small" data-action="refresh-rooms">ATUALIZAR SALAS</button><div class="public-rooms">${renderPublicRooms()}</div><p class="online-error">${state.onlineError}</p></div>
      <p class="local-note">PROTÓTIPO LOCAL · DOIS JOGADORES NO MESMO DISPOSITIVO</p>
    </div>
  </section>`
}

function renderPublicRooms() {
  if (!state.publicRooms.length) return '<p class="muted">Nenhuma sala aberta. Crie uma sala para aparecer aqui.</p>'
  return state.publicRooms.map((room) => `<button class="room-entry" data-room-code-entry="${room.code}"><strong>${room.hostCharacter.toUpperCase()}</strong><small>${room.players}/2 jogadores</small><span>ENTRAR</span></button>`).join('')
}

function playerPicker(index, label, fallback) {
  return `<label class="picker"><span>${label}</span><select data-player="${index}">
    ${Object.values(characters).map((character) => `<option value="${character.id}" ${character.id === fallback ? 'selected' : ''}>${character.name} — ${character.title}</option>`).join('')}
  </select></label>`
}

function renderBattle() {
  const [p1, p2] = state.players
  const activeIndex = state.online ? state.playerIndex : state.phase === 'p1' ? 0 : 1
  const activePlayer = state.players[activeIndex]
  const selected = state.selections[state.phase]
  const finished = Boolean(state.result)
  return `<section class="battle-shell">
    <header class="battle-topbar"><div class="top-player"><strong>JOGADOR 1 (${p1.name.toUpperCase()})</strong><div class="top-hp"><i style="width:${Math.min(100, Math.max(0, p1.hp / p1.maxHp * 100))}%"></i></div><span>${p1.hp}/${p1.maxHp}</span></div><div class="turn-count">TURNO <strong>${state.turn}</strong></div><div class="top-player opponent"><strong>JOGADOR 2 (${p2.name.toUpperCase()})</strong><div class="top-hp"><i style="width:${Math.min(100, Math.max(0, p2.hp / p2.maxHp * 100))}%"></i></div><span>${p2.hp}/${p2.maxHp}</span></div></header>
    <div class="battle-layout">
      <div class="arena-column">
        ${lastActionPanel()}
        <div class="arena-scene">
        </div>
        ${finished ? resultPanel() : actionPanel(activePlayer, state.players[activeIndex === 0 ? 1 : 0])}
      </div>
      <aside class="combat-log"><div class="panel-label">REGISTRO DE COMBATE</div><div class="log-list">${state.log.length ? state.log.map((entry) => `<p>${entry}</p>`).join('') : '<p class="muted">As ações do duelo aparecerão aqui.</p>'}</div></aside>
    </div>
  </section>`
}

function lastActionPanel() {
  const latest = state.lastTurnActions.length ? state.lastTurnActions : [{ player: '', text: 'Aguardando escolhas' }, { player: '', text: 'Aguardando escolhas' }]
  const formatAction = (entry) => entry.player ? `${entry.player}: ${entry.text}` : entry.text
  return `<div class="last-action"><span class="speaker-icon">◉</span><div class="last-action-title">ÚLTIMA AÇÃO</div><div class="last-action-copy"><strong>${formatAction(latest[0])}</strong><span class="crossed-swords">⚔</span><strong>${formatAction(latest[1])}</strong></div></div>`
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
  const secondary = player.character.abilities.find((ability) => ability.id !== 'basic' && ability.kind !== 'pending')
  return `<div class="action-panel"><div class="action-header"><div><p class="eyebrow">${phase === 'p1' ? 'JOGADOR 1' : 'JOGADOR 2'} / ${state.onlineWaiting ? 'AGUARDANDO OPONENTE' : 'ESCOLHA OCULTA'}</p><h3>${selected ? 'AÇÃO SELECIONADA' : `ESCOLHA DE ${player.name.toUpperCase()}`}</h3></div><span class="lock-icon">${selected ? '◉' : '○'}</span></div>
    <div class="action-buttons">${basic ? abilityButton(player, opponent, basic, selected) : ''}${secondary ? abilityButton(player, opponent, secondary, selected) : ''}</div>
    <div class="extra-abilities">${player.character.abilities.filter((ability) => ability.id !== basic?.id && ability.id !== secondary?.id).map((ability) => abilityButton(player, opponent, ability, selected)).join('')}</div>
    <div class="action-footer">${selected ? '<span class="confirmed">ESCOLHA SELECIONADA · AÇÃO ENVIADA IMEDIATAMENTE</span>' : '<span class="muted">Clique em uma habilidade para lançá-la sem confirmação.</span>'}</div>
    <button class="skip-button" data-action="skip">⏭ &nbsp; PULAR TURNO</button>
  </div>`
}

function abilityButton(player, opponent, ability, selected) {
  const forcedBasic = player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn
  const unavailable = forcedBasic && ability.id !== 'basic' || (ability.kind === 'pending' && ability.id !== 'bindings' && ability.id !== 'denial') || (ability.uses !== undefined && player.uses[ability.id] === 0) || (ability.kind === 'impulse' && player.rage < 55) || (ability.kind === 'heal' && player.rage < 30) || (ability.kind === 'deny' && player.rage < 25) || (ability.kind === 'execute' && opponent.hp > opponent.maxHp * 0.25)
  const disabled = unavailable || state.onlineWaiting
  return `<button class="ability ${selected === ability.id ? 'chosen' : ''} ${disabled ? 'disabled' : ''}" data-ability="${ability.id}" ${disabled ? 'disabled' : ''}><span class="ability-symbol">${ability.kind === 'damage' ? '✦' : ability.kind === 'deny' ? '⛔' : ability.kind === 'bindings' ? '⛓' : '◇'}</span><span><strong>${ability.name}</strong><small>${ability.detail}</small></span>${ability.uses !== undefined ? `<em>${player.uses[ability.id] ?? ability.uses}</em>` : ''}</button>`
}

function resultPanel() {
  return `<div class="result-panel"><p class="eyebrow">RESULTADO DO DUELO</p><h2>${state.result}</h2><button class="primary-button" data-action="restart">NOVA PARTIDA <span>↗</span></button></div>`
}

function bindEvents() {
  document.querySelectorAll('[data-player]').forEach((select) => select.addEventListener('change', (event) => { select.dataset.value = event.target.value }))
  document.querySelector('[data-action="start"]')?.addEventListener('click', startGame)
  document.querySelector('[data-action="create-online"]')?.addEventListener('click', () => connectOnline('create'))
  document.querySelector('[data-action="refresh-rooms"]')?.addEventListener('click', () => connectOnline('list'))
  document.querySelectorAll('[data-room-code-entry]').forEach((button) => button.addEventListener('click', () => connectOnline('join', button.dataset.roomCodeEntry)))
  document.querySelector('[data-action="cancel-online"]')?.addEventListener('click', () => { state.socket?.close(); state.screen = 'home'; state.online = false; render() })
  document.querySelector('[data-action="restart"]')?.addEventListener('click', () => { state.screen = 'home'; render() })
  document.querySelector('[data-action="next-player"]')?.addEventListener('click', confirmSelection)
  document.querySelector('[data-action="skip"]')?.addEventListener('click', skipTurn)
  document.querySelectorAll('[data-ability]').forEach((button) => button.addEventListener('click', () => {
    const phase = state.online ? `p${state.playerIndex + 1}` : state.phase
    chooseAbility(phase, button.dataset.ability)
  }))
}

function chooseAbility(phase, abilityId) {
  state.selections[phase] = abilityId
  if (state.online) {
    const ability = abilityId || 'basic'
    state.onlineWaiting = true
    state.socket?.send(JSON.stringify({ type: 'choose', ability }))
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
  chooseAbility(phase, 'skip')
}

function startGame() {
  const ids = [...document.querySelectorAll('[data-player]')].map((select) => select.value)
  state.players = ids.map((id) => createPlayer(characters[id]))
  state.screen = 'battle'; state.turn = 1; state.phase = 'p1'; state.selections = {}; state.log = []; state.result = ''; state.animation = null; state.online = false; state.onlineWaiting = false; state.opponentChosen = false
  render()
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
    uses: Object.fromEntries(character.abilities.filter((ability) => ability.uses !== undefined).map((ability) => [ability.id, ability.uses])),
    nextBasicBonus: 0,
    bonusExpiresTurn: 0,
    pendingPredatory: false,
    predatoryExpiresTurn: 0,
    forcedBasicTurns: 0,
    forcedBasicStartsTurn: 0,
    basicDamageBonus: 0,
    basicDamageBonusExpiresTurn: 0,
    blockedAbilityId: null,
    blockedAbilityUntilTurn: 0,
  }
}

function onlineSocketUrl() {
  return 'ws://2.25.214.134:8787'
}

function connectOnline(mode, selectedCode = '') {
  const character = document.querySelector(`[data-player="${mode === 'create' ? '0' : '1'}"]`)?.value ?? 'cedric'
  const code = selectedCode || document.querySelector('[data-room-code]')?.value.trim()
  state.onlineError = 'Conectando ao servidor...'
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
  state.socket = socket
  socket.addEventListener('open', () => socket.send(JSON.stringify(mode === 'create' ? { type: 'create', character } : mode === 'join' ? { type: 'join', code, character } : { type: 'list-rooms' })))
  socket.addEventListener('message', (event) => handleOnlineMessage(JSON.parse(event.data)))
  socket.addEventListener('error', () => { state.onlineError = 'Não foi possível conectar ao servidor. Verifique a internet e tente novamente.'; render() })
  socket.addEventListener('close', () => { if (!state.roomCode || state.screen === 'home') { state.onlineError = 'Conexão encerrada. Tente novamente.'; render() } })
  setTimeout(() => { if (socket.readyState === globalThis.WebSocket.CONNECTING) { socket.close(); state.onlineError = 'O servidor demorou para responder. Tente novamente.'; render() } }, 8000)
}

function handleOnlineMessage(message) {
  if (message.type === 'public-rooms') { state.publicRooms = message.rooms; render(); return }
  if (message.type === 'error') { state.onlineError = message.message; state.socket?.close(); state.screen = 'home'; render(); return }
  if (message.type === 'room-created') { state.online = true; state.playerIndex = 0; state.roomCode = message.code; state.screen = 'lobby'; render(); return }
  if (message.type === 'room-ready') {
    state.online = true; state.roomCode = message.code; state.turn = message.turn; state.playerIndex = message.index; state.players = message.players.sort((a, b) => a.index - b.index).map((player) => createPlayer(characters[player.character]))
    state.phase = `p${state.playerIndex + 1}`; state.screen = 'battle'; render(); return
  }
  if (message.type === 'choice-status' && message.index !== state.playerIndex) { state.opponentChosen = true; render(); return }
  if (message.type === 'resolve') {
    state.selections = { p1: message.choices[0], p2: message.choices[1] }
    state.onlineWaiting = false
    resolveTurn()
  }
  if (message.type === 'opponent-left') {
    state.onlineWaiting = false
    state.onlineError = 'Oponente saiu da sala. Aguarde um novo jogador ou entre novamente.'
    state.screen = 'lobby'
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
  const a1 = resolveSelection(p1, state.selections.p1, p2)
  const a2 = resolveSelection(p2, state.selections.p2, p1)
  state.lastTurnActions = [
    { player: p1.name, text: formatActionText(p1, state.selections.p1, a1) },
    { player: p2.name, text: formatActionText(p2, state.selections.p2, a2) },
  ]
  const events = [`Turno ${state.turn}: ${p1.name} usou ${a1.name}${state.selections.p1 !== a1.id ? ' (ação alterada).' : '.'}`, `Turno ${state.turn}: ${p2.name} usou ${a2.name}${state.selections.p2 !== a2.id ? ' (ação alterada).' : '.'}`]
  const predatoryTriggers = new Set()
  if (triggerPredatory(p1, p2, a1, a2, events)) predatoryTriggers.add(p1)
  if (triggerPredatory(p2, p1, a2, a1, events)) predatoryTriggers.add(p2)
  applyAction(p1, p2, a1, a2, events, predatoryTriggers); applyAction(p2, p1, a2, a1, events, predatoryTriggers)
  state.log = [...events, ...state.log].slice(0, 12)
  state.result = p1.hp <= 0 && p2.hp <= 0 ? 'Empate: os dois personagens chegaram a 0 HP.' : p1.hp <= 0 ? `${p2.name} venceu o duelo.` : p2.hp <= 0 ? `${p1.name} venceu o duelo.` : ''
  const cedricAttacker = shouldAnimateCedricBasic(p1, a1) ? 0 : shouldAnimateCedricBasic(p2, a2) ? 1 : -1
  state.animation = cedricAttacker === -1 ? null : { impact: false, targetIndex: cedricAttacker === 0 ? 1 : 0 }
  state.turn += 1; state.phase = 'p1'; state.selections = {}
  render()
}

function formatActionText(player, selectedId, ability) {
  if (selectedId === 'skip' || ability.kind === 'skip') return 'pulou turno'
  if (player.blockedAbilityId && ability.id === 'basic' && state.turn < player.blockedAbilityUntilTurn) return 'pulou turno'
  return ability.name
}

function shouldAnimateCedricBasic(player, ability) {
  return player.name === 'Cedric' && ability.id === 'basic'
}

function resolveSelection(player, selectedId, opponent) {
  if (selectedId === 'skip') return { id: 'skip', name: 'Pulou turno', kind: 'skip' }
  let ability = player.character.abilities.find((item) => item.id === selectedId) ?? player.character.abilities[0]
  if (player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn && ability.id !== 'basic') {
    ability = player.character.abilities.find((item) => item.id === 'basic') ?? ability
  }
  if (player.blockedAbilityId && ability.id === player.blockedAbilityId && state.turn < player.blockedAbilityUntilTurn) {
    ability = player.character.abilities.find((item) => item.id === 'basic') ?? ability
  }
  return ability
}

function getAbility(player, id) { return player.character.abilities.find((ability) => ability.id === id) ?? player.character.abilities[0] }

function triggerPredatory(player, opponent, ability, opponentAbility, events) {
  const selectedPredatory = ability.kind === 'predatory'
  if ((!player.pendingPredatory && !selectedPredatory) || opponentAbility.id !== 'basic') return false
  const recoveredHp = 180
  player.hp += recoveredHp
  player.pendingPredatory = false
  if (selectedPredatory) consume(player, ability)
  dealDamage(opponent, 160, events, `${player.name} ativou o Ataque predatório e causou 160 de dano.`)
  events.push(recoveredHp > 0 ? `${player.name} recuperou ${recoveredHp} HP.` : `${player.name} tentou recuperar 180 HP, mas já estava com o HP cheio.`)
  return true
}

function applyAction(player, opponent, ability, opponentAbility, events, predatoryTriggers) {
  if (player.nextBasicBonus && state.turn > player.bonusExpiresTurn) player.nextBasicBonus = 0
  const predatoryReady = player.pendingPredatory && state.turn === player.predatoryExpiresTurn
  if (player.pendingPredatory && state.turn >= player.predatoryExpiresTurn && !predatoryReady) player.pendingPredatory = false
  if (player.basicDamageBonus && state.turn > player.basicDamageBonusExpiresTurn) player.basicDamageBonus = 0
  const forcedBasicThisTurn = player.forcedBasicTurns > 0 && state.turn >= player.forcedBasicStartsTurn
  if (player.blockedAbilityId && state.turn >= player.blockedAbilityUntilTurn) {
    player.blockedAbilityId = null
    player.blockedAbilityUntilTurn = 0
  }
  if (predatoryTriggers.has(player)) return
  if (ability.kind === 'damage') {
    let damage = ability.damage + player.nextBasicBonus + (forcedBasicThisTurn ? 100 : 0) + (player.basicDamageBonus || 0)
    player.nextBasicBonus = 0
    if (player.markActive) {
      player.markBasicHits += 1
      if (player.markBasicHits >= 2) {
        damage += 270
        player.markActive = false
        player.markBasicHits = 0
        events.push(`${player.name} ativou a marca e causou 270 de dano extra.`)
      }
    }
    dealDamage(opponent, damage, events, `${player.name} causou ${damage} de dano.`)
  } else if (ability.kind === 'predatory') { player.pendingPredatory = true; player.predatoryExpiresTurn = state.turn + 1; consume(player, ability); events.push(`${player.name} armou o Ataque predatório para o próximo turno.`) }
  else if (ability.kind === 'mark') { player.markActive = true; player.markBasicHits = 0; consume(player, ability); events.push(`${player.name} marcou o alvo.`) }
  else if (ability.kind === 'execute') { consume(player, ability); if (opponent.hp <= opponent.maxHp * 0.25) { opponent.hp = 0; events.push(`${player.name} executou ${opponent.name}.`) } else events.push('Execução! falhou: o alvo ainda está acima de 25% de HP.') }
  else if (ability.kind === 'rage') { player.rage += state.turn > 10 ? 20 : 10; events.push(`${player.name} ganhou ${state.turn > 10 ? 20 : 10} de fúria.`) }
  else if (ability.kind === 'impulse') { player.rage -= 55; player.nextBasicBonus = 250; player.bonusExpiresTurn = state.turn + 1; events.push(`${player.name} concentrou +250 de dano no próximo ataque básico.`) }
  else if (ability.kind === 'heal') { player.rage -= 30; player.hp += 250; events.push(`${player.name} recuperou 250 HP. HP atual: ${player.hp}.`) }
  else if (ability.kind === 'bindings') { opponent.forcedBasicTurns = 2; opponent.forcedBasicStartsTurn = state.turn + 1; opponent.basicDamageBonus = 100; opponent.basicDamageBonusExpiresTurn = state.turn + 3; consume(player, ability); events.push(`${player.name} amarrou ${opponent.name}: ele será forçado a usar 2 ataques básicos nos próximos 2 turnos e receberá +100 em cada um.`) }
  else if (ability.kind === 'deny') { player.rage -= 25; const candidate = opponent.character.abilities.find((item) => item.id !== 'basic' && item.kind !== 'rage'); if (candidate) { opponent.blockedAbilityId = candidate.id; opponent.blockedAbilityUntilTurn = state.turn + 3; events.push(`${player.name} negou ${candidate.name} de ${opponent.name} pelos próximos 2 turnos.`) } else { events.push(`${player.name} tentou negar, mas ${opponent.name} não tinha habilidade ativa para bloquear.`) } }
  else if (ability.kind === 'skip') { events.push(`${player.name} pulou turno.`) }
  if (ability.kind !== 'damage' && ability.kind !== 'mark') player.markBasicHits = 0
  if (forcedBasicThisTurn) player.forcedBasicTurns -= 1
}

function consume(player, ability) { if (ability.uses !== undefined) player.uses[ability.id] -= 1 }
function dealDamage(target, damage, events, message) { target.hp = Math.max(0, target.hp - damage); events.push(message) }

render()