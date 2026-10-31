// Importe en letras (español): 1234.5 → "mil doscientos treinta y cuatro euros con cincuenta céntimos"
const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce',
  'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function menorMil(n) {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100), r = n % 100
  let t = c ? C[c] : ''
  if (r) {
    const parte = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '')
    t = (t ? t + ' ' : '') + parte
  }
  return t
}
function entero(n) {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000
  const partes = []
  if (millones) partes.push(millones === 1 ? 'un millón' : `${menorMil(millones).replace(/uno$/, 'un')} millones`)
  if (miles) partes.push(miles === 1 ? 'mil' : `${menorMil(miles).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} mil`)
  if (resto) partes.push(menorMil(resto))
  return partes.join(' ')
}
export function importeEnLetras(valor) {
  const total = Math.round(Number(valor) * 100)
  const e = Math.floor(total / 100), c = total % 100
  const euros = entero(e).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')
  let t = `${euros}${e && e % 1e6 === 0 ? ' de' : ''} ${e === 1 ? 'euro' : 'euros'}`
  if (c) t += ` con ${entero(c).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} ${c === 1 ? 'céntimo' : 'céntimos'}`
  return t.charAt(0).toUpperCase() + t.slice(1)
}
