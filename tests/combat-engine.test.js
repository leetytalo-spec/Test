import test from 'node:test'
import assert from 'node:assert/strict'
import { combatSnapshot, createCombat, isActionAvailable, resolveCombatTurn } from '../combat-engine.js'

function players() {
  return [
    { index: 0, userId: 1, name: 'Cedric', characterId: 'cedric' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ]
}

test('resolve um turno básico simultâneo', () => {
  const combat = createCombat(players(), 7)
  resolveCombatTurn(combat, ['basic', 'basic'])
  assert.equal(combat.players[0].hp, 1225)
  assert.equal(combat.players[1].hp, 1135)
  assert.equal(combat.turn, 2)
})

test('Marcar Alvo do Cedric explode no segundo ataque básico sequencial', () => {
  const combat = createCombat(players(), 7)
  const voss = combat.players[1]

  resolveCombatTurn(combat, ['mark', 'skip'])
  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.equal(voss.hp, 1135)
  assert.deepEqual(combat.players[0].lastDamage, [65])

  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.equal(voss.hp, 800)
  assert.deepEqual(combat.players[0].lastDamage, [65, 270])
})

test('Impulso do Voss mostra ataque básico e bônus separados', () => {
  const combat = createCombat(players(), 7)
  const voss = combat.players[1]
  voss.rage = 55

  resolveCombatTurn(combat, ['skip', 'impulse'])
  resolveCombatTurn(combat, ['skip', 'basic'])

  assert.deepEqual(voss.lastDamage, [75, 250])
  assert.equal(combat.players[0].hp, 975)
})

test('Pular turno sequencial acumula Ruminação do Voss', () => {
  const combat = createCombat(players(), 7)
  const voss = combat.players[1]

  resolveCombatTurn(combat, ['skip', 'skip'])
  resolveCombatTurn(combat, ['skip', 'skip'])
  resolveCombatTurn(combat, ['skip', 'skip'])

  assert.equal(voss.rage, 15)
})

test('aplica cura sem ultrapassar o HP máximo', () => {
  const combat = createCombat(players(), 7)
  combat.players[0].hp = 1000
  combat.players[0].rage = 30
  resolveCombatTurn(combat, ['heal', 'skip'])
  assert.equal(combat.players[0].hp, 1250)
  assert.ok(combat.players[0].hp <= combat.players[0].maxHp)
})

test('snapshot é serializável e registra resultado', () => {
  const combat = createCombat(players(), 7)
  combat.players[1].hp = 1
  resolveCombatTurn(combat, ['basic', 'skip'])
  const snapshot = combatSnapshot(combat)
  assert.equal(snapshot.result, 'player-1-win')
  assert.doesNotThrow(() => JSON.stringify(snapshot))
})

test('rejeita recurso insuficiente e mantém a ação básica', () => {
  const combat = createCombat(players(), 7)
  assert.equal(isActionAvailable(combat, 0, 'impulse'), false)
  resolveCombatTurn(combat, ['impulse', 'skip'])
  assert.equal(combat.players[1].hp, 1135)
})

test('Nox acumula marcas e o acionador causa dano proporcional', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Nox', characterId: 'nox' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)
  resolveCombatTurn(combat, ['marked', 'skip'])
  resolveCombatTurn(combat, ['trigger', 'skip'])
  assert.equal(combat.players[1].hp, 1140)
})

test('Nox limita 10 marcas, ganha 2 cargas de Pressão e Acionador libera novas marcas', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Nox', characterId: 'nox' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)
  const nox = combat.players[0]
  const voss = combat.players[1]

  for (let turn = 0; turn < 10; turn += 1) resolveCombatTurn(combat, ['marked', 'skip'])
  assert.equal(voss.noxMarks, 10)
  assert.equal(nox.noxPressure, 2)

  resolveCombatTurn(combat, ['marked', 'skip'])
  assert.equal(voss.noxMarks, 10)

  resolveCombatTurn(combat, ['trigger', 'skip'])
  assert.deepEqual(nox.lastDamage, [600])
  assert.equal(voss.noxMarks, 0)

  resolveCombatTurn(combat, ['marked', 'skip'])
  assert.equal(voss.noxMarks, 1)
})

test('Pressão do Nox bloqueia a habilidade escolhida por 1 turno', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Nox', characterId: 'nox' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)
  const nox = combat.players[0]
  const voss = combat.players[1]
  nox.noxPressure = 1
  voss.rage = 60

  resolveCombatTurn(combat, ['pressure:impulse', 'skip'])
  assert.equal(voss.blockedAction, 'impulse')
  assert.equal(voss.blockedSource, 'pressure')

  resolveCombatTurn(combat, ['skip', 'impulse'])
  assert.equal(voss.rage, 60)
  assert.equal(voss.blockedAction, null)
})

test('Progressão do Nox adiciona 1 marca passiva a cada 5 turnos', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Nox', characterId: 'nox' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)

  for (let turn = 0; turn < 4; turn += 1) resolveCombatTurn(combat, ['skip', 'skip'])
  assert.equal(combat.players[1].noxMarks, 0)

  resolveCombatTurn(combat, ['skip', 'skip'])
  assert.equal(combat.players[1].noxMarks, 1)
})

test('Kyn usa Premonição para carregar Dreno no ataque básico sem acumular', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Kyn', characterId: 'kyn' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)
  combat.players[0].hp = 1000

  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.equal(combat.players[1].hp, 1200)

  resolveCombatTurn(combat, ['foresight:basic', 'basic'])
  resolveCombatTurn(combat, ['foresight:basic', 'basic'])
  assert.equal(combat.players[0].drain, 125)

  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.equal(combat.players[1].hp, 1075)
  assert.equal(combat.players[0].hp, 943)
  assert.equal(combat.players[0].drain, 0)
})

test('Paciência e Tributo do Kyn são passivas de Dreno', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Kyn', characterId: 'kyn' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)

  assert.equal(isActionAvailable(combat, 0, 'patience'), false)
  assert.equal(isActionAvailable(combat, 0, 'tribute'), false)

  resolveCombatTurn(combat, ['skip', 'skip'])
  resolveCombatTurn(combat, ['skip', 'skip'])
  resolveCombatTurn(combat, ['skip', 'skip'])
  assert.equal(combat.players[0].drain, 100)

  resolveCombatTurn(combat, ['basic', 'basic'])
  assert.equal(combat.players[0].drain, 0)

  resolveCombatTurn(combat, ['skip', 'basic'])
  resolveCombatTurn(combat, ['skip', 'basic'])
  resolveCombatTurn(combat, ['skip', 'basic'])
  assert.equal(combat.players[0].drain, 200)
})

test('Damon só revive depois de ativar Ressuscitar e Colheita registra a cura', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Kyn', characterId: 'kyn' },
    { index: 1, userId: 2, name: 'Damon', characterId: 'damon' },
  ], 7)
  const kyn = combat.players[0]
  const damon = combat.players[1]
  damon.basicHitsReceived = 5
  damon.hp = 10

  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.equal(damon.hp, 10)

  damon.hp = 10
  damon.basicHitsReceived = 5
  resolveCombatTurn(combat, ['harvest', 'resurrect'])
  resolveCombatTurn(combat, ['foresight:skip', 'skip'])
  resolveCombatTurn(combat, ['foresight:skip', 'skip'])
  resolveCombatTurn(combat, ['basic', 'skip'])

  assert.equal(damon.hp, 500)
  assert.equal(damon.basicBonus, 60)
  assert.ok(kyn.drain >= 500)
})

test('Sou o melhor do Zero é embutido no ataque básico simultâneo', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Zero', characterId: 'zero' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)

  assert.equal(isActionAvailable(combat, 0, 'best'), false)
  resolveCombatTurn(combat, ['basic', 'basic'])

  assert.equal(combat.players[0].hp, 1500)
  assert.equal(combat.players[0].zeroExperience, 30)
  assert.equal(combat.players[1].hp, 1155)
})

test('Haku usa Concentração ao pular turno e só mantém Pular/Corte na Postura', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Haku', characterId: 'haku' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)
  const haku = combat.players[0]
  haku.hp = 1000

  resolveCombatTurn(combat, ['defensive-stance', 'skip'])
  assert.equal(haku.hakuDefenseTurns, 3)
  assert.equal(isActionAvailable(combat, 0, 'basic'), false)
  assert.equal(isActionAvailable(combat, 0, 'blade-dance'), false)
  assert.equal(isActionAvailable(combat, 0, 'skip'), true)
  assert.equal(isActionAvailable(combat, 0, 'deep-cut'), true)

  resolveCombatTurn(combat, ['skip', 'skip'])
  assert.equal(haku.hp, 1050)
  assert.equal(haku.hakuDefenseTurns, 2)

  resolveCombatTurn(combat, ['deep-cut', 'skip'])
  assert.equal(haku.hakuDefenseTurns, 1)

  resolveCombatTurn(combat, ['skip', 'skip'])
  assert.equal(haku.hakuDefenseTurns, 0)
})

test('Afiar da Haku avança a sequência a cada ataque básico', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Haku', characterId: 'haku' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)

  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.deepEqual(combat.players[0].lastDamage, [30])
  assert.equal(combat.players[1].hp, 1170)

  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.deepEqual(combat.players[0].lastDamage, [60])
  assert.equal(combat.players[1].hp, 1110)
})

test('Dança da Lâmina usa hits sequenciais e Última Dança dobra os hits', () => {
  const combat = createCombat([
    { index: 0, userId: 1, name: 'Haku', characterId: 'haku' },
    { index: 1, userId: 2, name: 'Voss', characterId: 'voss' },
  ], 7)
  const haku = combat.players[0]
  const voss = combat.players[1]

  resolveCombatTurn(combat, ['basic', 'skip'])
  resolveCombatTurn(combat, ['blade-dance', 'basic'])
  assert.deepEqual(haku.lastDamage, [60, 90])
  assert.equal(voss.hp, 1020)

  haku.hp = 700
  resolveCombatTurn(combat, ['basic', 'skip'])
  assert.deepEqual(haku.lastDamage, [120, 150])

  resolveCombatTurn(combat, ['blade-dance', 'basic'])
  assert.deepEqual(haku.lastDamage, [30, 60, 90, 120])
})