/**
 * Plata: siempre enteros de centavos + moneda. Nunca `float`.
 */
export type Currency = 'ARS' | 'USD'

export type Money = {
	readonly cents: number
	readonly currency: Currency
}

const assertCents = (cents: number) => {
	if (!Number.isSafeInteger(cents)) {
		throw new RangeError(
			`La plata va en centavos enteros; llegó ${String(cents)}.`
		)
	}
}

const money = (cents: number, currency: Currency = 'ARS'): Money => {
	assertCents(cents)
	return { cents, currency }
}

const assertSameCurrency = (a: Money, b: Money) => {
	if (a.currency !== b.currency) {
		throw new RangeError(
			`No se pueden operar ${a.currency} y ${b.currency} sin convertir.`
		)
	}
}

const addMoney = (a: Money, b: Money): Money => {
	assertSameCurrency(a, b)
	return money(a.cents + b.cents, a.currency)
}

const subtractMoney = (a: Money, b: Money): Money => {
	assertSameCurrency(a, b)
	return money(a.cents - b.cents, a.currency)
}

/**
 * Multiplica por una cantidad (por ejemplo 1,5 kg) y redondea al centavo
 * (half-up, como en un ticket).
 */
const multiplyMoney = (a: Money, quantity: number): Money =>
	money(Math.round(a.cents * quantity), a.currency)

export { addMoney, money, multiplyMoney, subtractMoney }
