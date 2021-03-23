import { Result as ResultValues, ID, Version } from "./index"

export type PlayerMap = {
   [key in ID]: number
}

export type GameParticipants = Readonly<[Glicko2Player, Glicko2Player, ...Glicko2Player[]]>


export type Result = PlayerMap

export const Defaults = {
   glicko2ScaleFactor: 173.7178, // Cannot change

   ratingInterval: 400, // Cannot change
   ratingValue: 1500, // Cannot change
   ratingDV: 350, // Cannot change
   ratingVolatility: 0.06,
   systemTau: 0.2,
   systemRatingPeriodLength: 60_000, // Every hour = 1 system rating period
   convergenceTolerance: 0.000001
} as const

export const Playerbase = [] as Player[]

// --------------------------------
// System Functions

let resultsToParse: Result[] = []
function addPlayer (player: Player): void {
   Playerbase.push(player)
}

function addGameResultToRatingPeriod (gameResult: Result) {
   resultsToParse.push(gameResult)
}

/**
 * Updates the rating with O(n^3)
 * 
 * @param results - "The scores against each opponent"
 * So if a player wins against Bob and Bob2, you would pass in the results: [1, 1]
 */
export function updatePlayerStats () {
   // Step 1: Initialize all player rating stats (done)

   // Step 2:
   const μ = Object.fromEntries(Playerbase.map(player => [player.id, (player.rating.value - Defaults.ratingValue) / Defaults.glicko2ScaleFactor]))
   const φ = Object.fromEntries(Playerbase.map(player => [player.id, player.rating.deviation / Defaults.glicko2ScaleFactor]))
   const σ = Object.fromEntries(Playerbase.map(player => [player.id, player.rating.volatility]))

   for (const player of Playerbase) {
      const scores = {} as any
      const opponentIDs = resultsToParse.flatMap(result => {
         if (player.id in result) {
            const someOpponentIDs = Object.keys(result).filter(id => id !== player.id)
            for (const ID of someOpponentIDs) {
               scores[ID] ??= [0, 0]
               scores[ID][0] += result[player.id]
               scores[ID][1] += result[ID]
            }
            return someOpponentIDs
         } else {
            return []
         }
      }) as ID[]

      const playerμ = μ[player.id]
      const playerφ = φ[player.id]
      const playerσ = σ[player.id]

      const m = opponentIDs.length

      if (Object.keys(scores).length === 0) {
         const pre_playerφ = Math.sqrt(__squared(playerφ) + __squared(playerσ))
         const new_playerφ = pre_playerφ
         const new_playerRD = Defaults.glicko2ScaleFactor * new_playerφ
         player.rating.deviation = new_playerRD
         continue;
      }

      for (const key in scores) {
         scores[key] = scores[key][0] / (scores[key][0] + scores[key][1])
      }

      // Optimization
      const gφ = Object.fromEntries(opponentIDs.map(id => [id, _g(φ[id])]))

      // Step 3 + Optimization
      const [v, Eparts] = _v(μ, gφ, σ, player, opponentIDs)

      // Step 4:
      const sigmaOptimization = opponentIDs.reduce((total: number, id: ID) => gφ[id] * (scores[id] - Eparts[id]), 0)
      const delta = v * sigmaOptimization

      // Step 5.1:
      const a = Math.log(__squared(playerφ))

      // Step 5.2:
      let A: number = a
      let B: number
      if (__squared(delta) > __squared(playerφ) + v) {
         B = Math.log(__squared(delta) - __squared(playerφ) - v)
      } else {
         let k = 1
         while (_f(a - (k * Defaults.systemTau), delta, playerφ, v, a) < 0) {
            k++
         }

         B = a - (k * Defaults.systemTau)
      }

      // Step 5.3
      let fA = _f(A, delta, playerφ, v, a)
      let fB = _f(B, delta, playerφ, v, a)

      // Step 5.4
      while (Math.abs(B - A) > Defaults.convergenceTolerance) {
         // 5.4a
         let C = A + (((A - B) * fA) / (fB - fA))
         let fC = _f(C, delta, playerφ, v, a)

         // 5.4b
         if (fC * fB < 0) {
            A = B
            fA = fB
         } else {
            fA = fA / 2
         }

         // 5.4c
         B = C
         fB = fC
      }

      // Step 5.5
      const new_playerσ = Math.E ** (A / 2)

      // Step 6
      const pre_playerφ = Math.sqrt(__squared(playerφ) + __squared(new_playerσ))

      // Step 7
      const new_playerφ = 1 / Math.sqrt((1 / __squared(pre_playerφ)) + (1 / v))
      const new_playerμ = playerμ + __squared(new_playerφ) * sigmaOptimization

      // Step 8
      const new_playerRating = Defaults.glicko2ScaleFactor * new_playerμ + Defaults.ratingValue
      const new_playerRD = Defaults.glicko2ScaleFactor * new_playerφ

      player.rating.value = new_playerRating
      player.rating.deviation = new_playerRD
      player.rating.volatility = new_playerσ
   }
}

// Estimated variance of a rating based on game outcomes
// (The actual formula only uses the stats of the opponents that were played)
function _v (μ: PlayerMap, gφ: PlayerMap, σ: PlayerMap, player: Player, opponentIDs: ID[]): [number, Record<ID, number>] {
   // [Σ g(opponent φ)² * E(player μ, opponent μ, opponent φ) * (1 - E(player μ, opponent μ, opponent φ))] ^ -1

   let total = 0
   const Eparts = [] as [ID, number][]

   opponentIDs.forEach((id: ID) => {
      let Epart = _E_optimization(player.rating.value, μ[id], gφ[id])
      total += gφ[id] * gφ[id] * Epart * (1 - Epart)
      Eparts.push([id, Epart])
   })

   return [1 / total, Object.fromEntries(Eparts)] // Same as total ** -1
}

function _gSquared (φ: number) {
   // g(φ) = 1 / sqrt(stuff)
   // g(φ)² = 1 / stuff
   return 1 / (1 + (3 * (φ ** 2 / Math.PI ** 2)))
}

function _g (φ: number) {
   return 1 / Math.sqrt(1 + (3 * (φ ** 2 / Math.PI ** 2)))
}

function _E (μ: number, μj: number, φj: number) {
   return 1 / (1 + Math.exp(-1 * _g(φj) * (μ - μj)))
}

function _E_optimization (μ: number, μj: number, gφj: number) {
   return 1 / (1 + Math.exp(-1 * gφj * (μ - μj)))
}

function _f(x: number, delta: number, playerφ: number, v: number, a: number) {
   const e2TheX = Math.E ** x
   const tempPart = __squared(playerφ) + v + e2TheX
   return (
      ((e2TheX * (__squared(delta) - tempPart)) / (2 * __squared(tempPart))) - ((x - a) / __squared(Defaults.systemTau))
   )
}

function __squared(n: number) {
   return n * n
}

setInterval(updatePlayerStats, Defaults.systemRatingPeriodLength)

// ---------------------------------------------------------------------------------------

export class Glicko2Rating {
   static resultsToParse: Result[]

   value: number
   deviation: number
   volatility: number
   constructor () {
      this.value = Defaults.ratingValue
      this.deviation = Defaults.ratingDV
      this.volatility = Defaults.ratingVolatility
   }
}


export class Glicko2Game {
   static totalGames = 0

   readonly id: ID
   readonly players: gameParticipants
   startTime: number | null
   finishTime: number | null
   result: ResultValues | null

   constructor (players: gameParticipants, id?: ID | null, startImmediately: boolean = false) {
      this.id = id ?? Game.totalGames

      this.players = players
      this.startTime = startImmediately ? Date.now() : null
      this.finishTime = null
      this.result = null

      Game.totalGames++

      for (const player of players) {
         if (!player.games.includes(this)) {
            player.games.push(this)
         }
      }
   }

   start (): number {
      if (this.startTime !== null) {
         throw ReferenceError('Game already started')
      }

      return (this.startTime = Date.now()) // intentional return-assign
   }

   finish (result: ResultValues): number {
      if (this.finishTime !== null) {
         throw ReferenceError('Game already finished')
      }

      this.result = result
      addGameResultToRatingPeriod(this.glicko2result as Result)

      return (this.finishTime = Date.now()) // intentional return assign
   }

   get glicko2result (): Result | null {
      if (this.result === null) {
         return null
      }

      const result = {} as Result
      for (let i = 0; i < this.result.length; i++) {
         result[this.players[i].id] = this.result[i]
      }

      return result
   }
}

export class Glicko2Player {
   static totalPlayers: number = 0

   id: ID
   rating: Glicko2Rating
   games: Game[]

   constructor (id?: ID | null) {
      this.id = id ?? Player.totalPlayers++
      this.games = []
      this.rating = new Glicko2Rating()
      addPlayer(this)
   }
}
      
export class Glicko2Bot extends Glicko2Player {
   version: Version
   constructor (id?: ID | null, version?: Version | null) {
      super(id)
      this.version = version ?? new Version(0, 1, 0)
   }
}

