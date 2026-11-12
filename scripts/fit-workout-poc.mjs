// Prova de conceito (fase 0 da integração Garmin): gera um ARQUIVO FIT DE TREINO ESTRUTURADO
// (não é atividade) e confere a integridade lendo de volta com o SDK oficial.
// Uso: node scripts/fit-workout-poc.mjs [saida.fit] [--simples]
// Treino: 10 min aquecimento → 6 × (800 m a 4:50–5:10/km + 2 min recuperação) → 10 min desaquecimento.
// --simples: só "Corrida leve 20 min", sem alvo (para separar problema de envio de problema de formato).
import fs from 'node:fs'
import { Decoder, Encoder, Profile, Stream } from '@garmin/fitsdk'

const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'paceon-6x800.fit'
const simple = process.argv.includes('--simples')

/** Pace "m:ss" por km → velocidade em mm/s (unidade bruta do FIT: m/s × 1000). */
const paceToMmS = (pace) => {
  const [m, s] = pace.split(':').map(Number)
  return Math.round((1000 / (m * 60 + s)) * 1000)
}

// Passos (valores brutos do FIT: tempo em ms, distância em cm).
const steps = simple ? [
  { wktStepName: 'Corrida leve', intensity: 'active', durationType: 'time', durationValue: 20 * 60 * 1000, targetType: 'open' }
] : [
  { wktStepName: 'Aquecimento', intensity: 'warmup', durationType: 'time', durationValue: 10 * 60 * 1000, targetType: 'open' },
  // Faixa de pace: "low" é a velocidade menor (pace mais lento).
  { wktStepName: 'Tiro 800 m', intensity: 'active', durationType: 'distance', durationValue: 800 * 100, targetType: 'speed', targetValue: 0, customTargetValueLow: paceToMmS('5:10'), customTargetValueHigh: paceToMmS('4:50') },
  { wktStepName: 'Recuperação', intensity: 'recovery', durationType: 'time', durationValue: 2 * 60 * 1000, targetType: 'open' },
  // Repetir a partir do passo 1, 6 vezes no total.
  { durationType: 'repeatUntilStepsCmplt', durationValue: 1, targetType: 'open', targetValue: 6 },
  { wktStepName: 'Desaquecimento', intensity: 'cooldown', durationType: 'time', durationValue: 10 * 60 * 1000, targetType: 'open' }
]

const enc = new Encoder()
enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'workout', manufacturer: 'development', product: 0, serialNumber: 20261112, timeCreated: new Date() })
enc.onMesg(Profile.MesgNum.WORKOUT, { wktName: simple ? 'PaceOn 20min' : 'PaceOn 6x800', sport: 'running', subSport: 'generic', numValidSteps: steps.length })
steps.forEach((s, i) => enc.onMesg(Profile.MesgNum.WORKOUT_STEP, { messageIndex: i, ...s }))
const bytes = enc.close()
fs.writeFileSync(out, bytes)

// Conferência: lê de volta com o decodificador oficial.
const dec = new Decoder(Stream.fromByteArray(bytes))
if (!dec.isFIT() || !dec.checkIntegrity()) throw new Error('Arquivo FIT inválido (cabeçalho ou CRC).')
const { messages, errors } = dec.read()
if (errors.length) throw new Error('Erros ao ler: ' + errors.map((e) => e.message).join('; '))
const fileId = messages.fileIdMesgs[0]
const wkt = messages.workoutMesgs[0]
console.log(`Arquivo: ${out} (${bytes.length} bytes) · tipo=${fileId.type} · treino="${wkt.wktName}" · esporte=${wkt.sport} · passos=${wkt.numValidSteps}`)
const pace = (mps) => { const s = Math.round(1000 / mps); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
for (const s of messages.workoutStepMesgs) {
  const dur = s.durationType === 'time' ? `${s.durationTime} s` : s.durationType === 'distance' ? `${s.durationDistance} m` : s.durationType === 'repeatUntilStepsCmplt' ? `repetir a partir do passo ${s.durationStep}, ${s.repeatSteps}×` : s.durationType
  const tgt = s.targetType === 'speed' ? `pace ${pace(s.customTargetSpeedHigh)}–${pace(s.customTargetSpeedLow)}/km` : s.targetType
  console.log(`  ${s.messageIndex}. ${s.wktStepName ?? '(repetição)'} · ${s.intensity ?? '-'} · ${dur} · alvo: ${tgt}`)
}
