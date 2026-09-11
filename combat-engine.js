const CHARACTER_RULES = {
  cedric: { maxHp: 1300, basic: 65 },
  voss: { maxHp: 1200, basic: 75 },
  damon: { maxHp: 1600, basic: 60 },
  kyn: { maxHp: 1250, basic: 0 },
  nox: { maxHp: 1400, basic: 80 },
  brick: { maxHp: 1450, basic: 25 },
  zero: { maxHp: 1500, basic: 45 },
  haku: { maxHp: 1350, basic: 30 },
  ogro: { maxHp: 1700, basic: 35 },
}

const HAKU_ATTACK_VALUES = [30, 60, 90, 120, 150]

function playerState(player) {
  const rules = CHARACTER_RULES[player.characterId] || CHARACTER_RULES.cedric
  return {
    index: player.index,
    userId: player.userId,
    name: player.name,
    characterId: player.characterId,
    hp: rules.maxHp,
    maxHp: rules.maxHp,
    rage: 0,
    drain: 0,
    basicBonus: 0,
    marked: false,
    markedHits: 0,
    dodge: false,
    forcedBasicTurns: 0,
    resistance: 0,
    ruminationHits: 0,
    ruminationLastKind: null,
    damageHistory: [],
    basicHitsReceived: 0,
    resurrectionArmed: false,
    secondLifeArmed: false,
    noxMarks: 0,
    noxMarksApplied: 0,
    noxPressure: 0,
    noxLocked: false,
    hakuStep: 0,
    hakuDefenseTurns: 0,
    hakuDance: false,
    hakuDanceResolvedTurn: 0,
    hakuDeepCutTurns: 0,
    zeroExperience: 0,
    zeroLevel: 1,
    noBasicTurns: 0,
    noDrainTurns: 0,
    harvestTurns: 0,
    harvestHealing: 0,
    drainGainedThisTurn: false,
    ogroGrabActive: false,
    ogroGrabbedTurns: 0,
    ogroRoarTurns: 0,
    forcedSkipTurns: 0,
    forcedRandomTurns: 0,
    blockedAction: null,
    blockedSource: '',
    blockedTurns: 0,
    counterArmed: false,
    brickDodges: 0,
    brickPunches: 0,
    uses: { predatory: 3, mark: 2, execute: 1, bindings: 3, direct: 3, dodge: 4, resurrect: 1, 'broken-limit': 1, 'deep-cut': 1, 'defensive-stance': 2, grab: 1, kick: 1, roar: 1, throw: 1, sacrifice: 99, impulse: 99, heal: 99, denial: 99, trigger: 99 },
  }
}

export function createCombat(players, seed = 1) {
  return { turn: 1, seed: Number(seed) || 1, players: players.map(playerState), result: null, log: [] }
}

export function isActionAvailable(combat, playerIndex, action) {
  const player = combat.players[playerIndex]
  if (!player || typeof action !== 'string') return false
  const actionId = selectedActionId(action)
  if (player.characterId === 'haku' && player.hakuDefenseTurns > 0 && actionId !== 'skip' && actionId !== 'deep-cut') return false
  if (actionId === 'skip' || actionId === 'basic') return true
  if (actionId === 'best') return false
  if (player.characterId === 'kyn' && (actionId === 'patience' || actionId === 'tribute')) return false
  if (player.characterId === 'nox' && (actionId === 'reconstruction' || actionId === 'progression')) return false
  if (player.characterId === 'nox' && actionId === 'pressure' && player.noxPressure <= 0) return false
  if (player.uses[actionId] === 0) return false
  if (actionId === 'impulse' && player.rage < 55) return false
  if (actionId === 'heal' && player.rage < 30) return false
  if (actionId === 'denial' && player.rage < 25) return false
  if (actionId === 'execute' && combat.players[playerIndex === 0 ? 1 : 0].hp > combat.players[playerIndex === 0 ? 1 : 0].maxHp * .25) return false
  if (actionId === 'resurrect' && player.basicHitsReceived < 5) return false
  return true
}

function selectedActionId(action) {
  return String(action || '').split(':')[0]
}

function predictedActionId(action) {
  return String(action || '').split(':')[1] || ''
}

function addNoxMark(player, opponent, amount) {
  if (player.characterId !== 'nox' || !opponent || opponent.noxMarks >= 10) {
    if (opponent?.noxMarks >= 10) player.noxLocked = true
    return 0
  }
  const beforeAppliedGroup = Math.floor((player.noxMarksApplied || 0) / 10)
  const added = Math.min(amount, 10 - opponent.noxMarks)
  opponent.noxMarks += added
  player.noxMarksApplied += added
  const afterAppliedGroup = Math.floor(player.noxMarksApplied / 10)
  if (afterAppliedGroup > beforeAppliedGroup) player.noxPressure += (afterAppliedGroup - beforeAppliedGroup) * 2
  if (opponent.noxMarks >= 10) player.noxLocked = true
  return added
}

function random(combat) {
  let value = (combat.seed + combat.turn * 1664525 + combat.log.length * 1013904223) >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) / 4294967296
}

function damage(combat, target, amount, events) {
  if (target.dodge) {
    target.dodge = false
    events.push(`${target.name} esquivou o ataque.`)
    return 0
  }
  const reduction = target.hakuDefenseTurns > 0 ? .45 : target.ogroRoarTurns > 0 ? .7 : 1
  const actual = Math.max(0, Math.floor(amount * reduction) - target.resistance * 5)
  target.damageHistory.push(actual)
  target.damageHistory = target.damageHistory.slice(-11)
  target.hp = Math.max(0, target.hp - actual)
  if (target.characterId === 'damon' && target.hp > 0) target.resurrectionArmed = target.basicHitsReceived >= 5
  if (target.hp <= 0 && target.secondLifeArmed) {
    target.secondLifeArmed = false
    target.hp = 1
    addDrain(target, 200)
    events.push(`${target.name} ativou Sobrevida.`)
  } else if (target.hp <= 0 && target.characterId === 'damon' && target.resurrectionArmed) {
    target.resurrectionArmed = false
    heal(combat, target, 500, events)
    target.basicBonus += 60
    events.push(`${target.name} ressuscitou.`)
  }
  events.push(`${target.name} recebeu ${actual} de dano.`)
  return actual
}

function heal(combat, target, amount, events) {
  const adjusted = target.hakuDeepCutTurns > 0 ? amount * .5 : amount
  const actual = Math.min(target.maxHp - target.hp, Math.max(0, Math.floor(adjusted)))
  target.hp += actual
  if (actual) {
    combat.players.forEach((player) => {
      if (player !== target && player.characterId === 'kyn' && player.harvestTurns > 0) player.harvestHealing += actual
    })
    combat.players.forEach((player) => {
      if (player === target || player.characterId !== 'nox' || target.noxMarks < 8 || target.noxMarks > 10) return
      const copied = Math.min(player.maxHp - player.hp, actual)
      player.hp += copied
      if (copied) events.push(`${player.name} copiou ${copied} de cura com Reconstrução.`)
    })
    events.push(`${target.name} recuperou ${actual} HP.`)
  }
  return actual
}

function addDrain(player, amount, replace = false) {
  if (player.characterId !== 'kyn' || amount <= 0) return
  player.drain = replace ? amount : player.drain + amount
  player.drainGainedThisTurn = true
  player.noDrainTurns = 0
}

function takeHakuHits(player, count) {
  return Array.from({ length: count }, () => {
    const damage = HAKU_ATTACK_VALUES[player.hakuStep] || 30
    player.hakuStep = (player.hakuStep + 1) % HAKU_ATTACK_VALUES.length
    return damage
  })
}

function use(player, ability) {
  if (player.uses[ability] !== undefined && player.uses[ability] > 0) player.uses[ability] -= 1
}

function trackVossRumination(target, action) {
  if (target.characterId !== 'voss') return
  const kind = action === 'basic' ? 'basic' : action === 'skip' ? 'skip' : 'ability'
  target.ruminationHits = target.ruminationLastKind === kind ? target.ruminationHits + 1 : 1
  target.ruminationLastKind = kind
  if (target.ruminationHits >= 3) {
    target.rage += 15
    target.ruminationHits = 0
    target.ruminationLastKind = null
  }
}

function applyAction(combat, player, opponent, action, opponentAction, events) {
  const actionId = selectedActionId(action)
  const opponentActionId = selectedActionId(opponentAction)
  let normalized = player.forcedBasicTurns > 0 || player.forcedSkipTurns > 0 ? 'basic' : actionId
  if (player.forcedSkipTurns > 0) { normalized = 'skip'; player.forcedSkipTurns -= 1 }
  if (player.forcedRandomTurns > 0) { normalized = ['basic', 'rage', 'heal', 'direct'][Math.floor(random(combat) * 4)]; player.forcedRandomTurns -= 1 }
  if (player.forcedBasicTurns > 0) player.forcedBasicTurns -= 1
  if (player.hakuDefenseTurns > 0 && normalized !== 'skip' && normalized !== 'deep-cut') normalized = 'skip'
  if (player.characterId === 'cedric' && opponent.marked && normalized !== 'basic' && normalized !== 'mark') opponent.markedHits = 0
  if (player.zeroBestCancelled) {
    player.zeroBestCancelled = false
    player.lastDamage = [0]
    if (opponent.characterId === 'zero') {
      opponent.zeroExperience += 30
      opponent.zeroLevel = opponent.zeroExperience >= 340 ? 5 : opponent.zeroExperience >= 250 ? 4 : opponent.zeroExperience >= 130 ? 3 : opponent.zeroExperience >= 50 ? 2 : 1
    }
    events.push(`${player.name} teve o ataque básico anulado por Sou o melhor!`)
    return
  }
  if (normalized === 'skip') {
    player.noBasicTurns += 1
    if (player.characterId === 'haku') heal(combat, player, 50, events)
    if (player.hakuDefenseTurns > 0) player.hakuDefenseTurns -= 1
    if (player.ogroRoarTurns > 0) player.ogroRoarTurns -= 1
    if (player.hakuDeepCutTurns > 0) player.hakuDeepCutTurns -= 1
    trackVossRumination(opponent, normalized)
    return
  }
  if (player.blockedAction === normalized && player.blockedTurns > 0) {
    normalized = player.blockedSource === 'pressure' ? 'skip' : 'basic'
    player.blockedTurns -= 1
    if (player.blockedTurns === 0) { player.blockedAction = null; player.blockedSource = '' }
  }
  if (normalized === 'basic' || normalized === 'direct') {
    const hakuHits = player.characterId === 'haku' && normalized === 'basic' ? takeHakuHits(player, player.hp < player.maxHp * .55 ? 2 : 1) : []
    const baseAmount = hakuHits.length ? hakuHits.reduce((sum, value) => sum + value, 0) : normalized === 'direct' ? 35 : CHARACTER_RULES[player.characterId].basic
    let amount = baseAmount
    const kynDrainDamage = player.characterId === 'kyn' && normalized === 'basic' ? player.drain : 0
    if (player.characterId === 'zero') amount = [45, 75, 120, 170, 265][Math.min(4, player.zeroLevel - 1)]
    amount += kynDrainDamage
    const bonusAmount = player.basicBonus
    amount += bonusAmount
    player.basicBonus = 0
    const dealt = damage(combat, opponent, amount, events)
    player.lastDamage = hakuHits.length ? hakuHits : normalized === 'basic' ? [amount - bonusAmount, ...(bonusAmount > 0 ? [bonusAmount] : [])] : [amount]
    player.noBasicTurns = 0
    if (opponent.characterId === 'damon') opponent.basicHitsReceived += 1
    if (dealt && kynDrainDamage > 0) {
      heal(combat, player, Math.floor(kynDrainDamage * .75), events)
      player.drain = 0
      player.drainGainedThisTurn = true
      player.noDrainTurns = 0
    }
    if (opponent.marked && player.characterId === 'cedric' && normalized === 'basic') {
      opponent.markedHits += 1
      if (opponent.markedHits >= 2) {
        opponent.marked = false
        opponent.markedHits = 0
        player.lastDamage = [...(player.lastDamage || []), 270]
        damage(combat, opponent, 270, events)
      }
    }
    if (opponent.characterId === 'brick' && normalized === 'basic' && random(combat) < .5) damage(combat, player, 25, events)
    if (opponent.characterId === 'brick') opponent.brickPunches += 1
    if (opponent.hakuDance && normalized === 'basic') {
      opponent.hakuDance = false
      opponent.hakuDanceResolvedTurn = combat.turn
      const danceHits = takeHakuHits(opponent, opponent.hp < opponent.maxHp * .55 ? 4 : 2)
      opponent.lastDamage = danceHits
      damage(combat, player, danceHits.reduce((sum, value) => sum + value, 0), events)
    }
    if (player.characterId === 'zero' && opponent.hp > player.hp) heal(combat, player, Math.floor(dealt * .2), events)
    trackVossRumination(opponent, normalized)
    return
  }
  if (normalized === 'predatory') {
    use(player, normalized); player.basicBonus = 160; heal(combat, player, 180, events); return
  }
  if (normalized === 'mark') {
    use(player, normalized); opponent.marked = true; opponent.markedHits = 0; return
  }
  if (normalized === 'execute') {
    use(player, normalized)
    player.pendingExecute = true
    player.pendingExecuteThresholdHp = opponent.hp
    return
  }
  if (normalized === 'bindings' || normalized === 'pain-hunger' || normalized === 'provoke') {
    use(player, normalized); opponent.forcedBasicTurns = normalized === 'bindings' ? 2 : 1; opponent.basicBonus += normalized === 'bindings' ? 100 : 70; return
  }
  if (normalized === 'rage') { player.rage += combat.turn > 10 ? 20 : 10; return }
  if (normalized === 'impulse') { player.rage = Math.max(0, player.rage - 55); player.basicBonus += 250; return }
  if (normalized === 'heal') { player.rage = Math.max(0, player.rage - 30); heal(combat, player, 250, events); return }
  if (normalized === 'sacrifice') { player.hp = Math.max(1, player.hp - 200); player.basicBonus += 200; return }
  if (normalized === 'resurrect') { if (player.basicHitsReceived >= 5) { player.resurrectionArmed = true; use(player, normalized) } return }
  if (normalized === 'resistance') { player.resistance += 1; return }
  if (normalized === 'broken-limit' && combat.turn > 11) { damage(combat, opponent, player.damageHistory.reduce((sum, value) => sum + value, 0) * .45, events); use(player, normalized); return }
  if (normalized === 'foresight') { if (predictedActionId(action) === opponentActionId) addDrain(player, 125, true); return }
  if (normalized === 'harvest') { player.harvestTurns = 4; player.harvestHealing = 0; use(player, normalized); return }
  if (normalized === 'second-life') { player.secondLifeArmed = true; return }
  if (normalized === 'patience' || normalized === 'tribute') return
  if (normalized === 'marked') { if (!player.noxLocked) addNoxMark(player, opponent, 1); return }
  if (normalized === 'trigger') { const triggerDamage = opponent.noxMarks * 60; player.lastDamage = [triggerDamage]; damage(combat, opponent, triggerDamage, events); opponent.noxMarks = 0; player.noxLocked = false; return }
  if (normalized === 'pressure' && player.noxPressure > 0 && predictedActionId(action)) { player.noxPressure -= 1; opponent.blockedAction = predictedActionId(action); opponent.blockedSource = 'pressure'; opponent.blockedTurns = 1; return }
  if (normalized === 'progression') return
  if (normalized === 'reconstruction') return
  if (normalized === 'dodge') { player.dodge = true; use(player, normalized); return }
  if (normalized === 'analysis' && opponentAction !== 'basic') { player.zeroExperience += 30; player.zeroLevel = player.zeroExperience >= 340 ? 5 : player.zeroExperience >= 250 ? 4 : player.zeroExperience >= 130 ? 3 : player.zeroExperience >= 50 ? 2 : 1; return }
  if (normalized === 'best' && action === opponentAction && opponentAction === 'basic') { player.basicBonus += 30; return }
  if (normalized === 'denial') { player.rage = Math.max(0, player.rage - 25); opponent.blockedAction = opponentAction === 'basic' ? null : opponentAction; opponent.blockedTurns = 2; return }
  if (normalized === 'defensive-stance') { player.hakuDefenseTurns = 3; return }
  if (normalized === 'blade-dance') { if (player.hakuDanceResolvedTurn !== combat.turn) player.hakuDance = true; return }
  if (normalized === 'deep-cut') { opponent.hakuDeepCutTurns = 5; if (player.hakuDefenseTurns > 0) player.hakuDefenseTurns -= 1; return }
  if (normalized === 'grab') { player.ogroGrabActive = true; opponent.ogroGrabbedTurns = 5; return }
  if (normalized === 'squeeze' && player.ogroGrabActive) { damage(combat, opponent, 50, events); return }
  if (normalized === 'release') { player.ogroGrabActive = false; opponent.ogroGrabbedTurns = 0; return }
  if (normalized === 'kick') { opponent.forcedSkipTurns = 1; return }
  if (normalized === 'roar') { player.ogroRoarTurns = 2; return }
  if (normalized === 'throw') { opponent.forcedRandomTurns = 1; return }
  if (normalized === 'counter') { player.counterArmed = true; return }
  if (normalized === 'retaliation' && player.brickDodges >= 2 && player.brickPunches >= 6) { damage(combat, opponent, 700, events); player.brickDodges = 0; player.brickPunches = 0; return }
  if (normalized === 'concentration') { heal(combat, player, 50, events); return }
  if (player.hakuDeepCutTurns > 0) player.hakuDeepCutTurns -= 1
}

function updateKynPassives(player, opponentAction) {
  if (player.characterId !== 'kyn') return
  if (selectedActionId(opponentAction) === 'basic') player.noBasicTurns = 0
  else {
    player.noBasicTurns += 1
    if (player.noBasicTurns >= 3) {
      addDrain(player, 100)
      player.noBasicTurns = 0
    }
  }
  if (player.drainGainedThisTurn) return
  player.noDrainTurns += 1
  if (player.noDrainTurns >= 3) {
    addDrain(player, 200)
    player.hp = Math.max(1, player.hp - 150)
    player.noDrainTurns = 0
  }
}

function tickHarvest(player) {
  if (player.characterId !== 'kyn' || player.harvestTurns <= 0) return
  player.harvestTurns -= 1
  if (player.harvestTurns === 0) {
    addDrain(player, player.harvestHealing)
    player.harvestHealing = 0
  }
}

function resolvePendingExecute(combat, player, opponent, events) {
  if (!player.pendingExecute) return
  player.pendingExecute = false
  const thresholdHp = typeof player.pendingExecuteThresholdHp === 'number' ? player.pendingExecuteThresholdHp : opponent.hp
  const shouldExecute = thresholdHp <= opponent.maxHp * .25
  if (shouldExecute) {
    opponent.hp = 0
    events.push(`${player.name} executou ${opponent.name}.`)
  } else {
    events.push('Execução! falhou: o alvo ainda está acima de 25% de HP.')
  }
  player.pendingExecuteThresholdHp = null
}

export function resolveCombatTurn(combat, actions) {
  if (combat.result) return combat
  const first = combat.players[0]
  const second = combat.players[1]
  first.drainGainedThisTurn = false
  second.drainGainedThisTurn = false
  combat.players.forEach((player, index) => {
    if (player.characterId === 'nox' && combat.turn % 5 === 0 && !player.noxLocked) addNoxMark(player, combat.players[index === 0 ? 1 : 0], 1)
  })
  const actionOne = isActionAvailable(combat, 0, String(actions[0] || 'basic')) ? String(actions[0] || 'basic') : 'basic'
  const actionTwo = isActionAvailable(combat, 1, String(actions[1] || 'basic')) ? String(actions[1] || 'basic') : 'basic'
  const events = [`Turno ${combat.turn}: ${first.name} escolheu ${actionOne}.`, `Turno ${combat.turn}: ${second.name} escolheu ${actionTwo}.`]
  if (first.characterId === 'haku' && selectedActionId(actionOne) === 'blade-dance' && selectedActionId(actionTwo) === 'basic') first.hakuDance = true
  if (second.characterId === 'haku' && selectedActionId(actionTwo) === 'blade-dance' && selectedActionId(actionOne) === 'basic') second.hakuDance = true
  if (selectedActionId(actionOne) === 'basic' && selectedActionId(actionTwo) === 'basic') {
    if (first.characterId === 'zero') second.zeroBestCancelled = true
    if (second.characterId === 'zero') first.zeroBestCancelled = true
  }
  applyAction(combat, first, second, actionOne, actionTwo, events)
  applyAction(combat, second, first, actionTwo, actionOne, events)
  resolvePendingExecute(combat, first, second, events)
  resolvePendingExecute(combat, second, first, events)
  tickHarvest(first)
  tickHarvest(second)
  updateKynPassives(first, actionTwo)
  updateKynPassives(second, actionOne)
  combat.log = [...events, ...combat.log].slice(0, 20)
  if (first.hp <= 0 && second.hp <= 0) combat.result = 'draw'
  else if (first.hp <= 0) combat.result = 'player-1-loss'
  else if (second.hp <= 0) combat.result = 'player-1-win'
  combat.turn += 1
  return combat
}

export function combatSnapshot(combat) {
  return { turn: combat.turn, result: combat.result, players: combat.players, log: combat.log }
}
