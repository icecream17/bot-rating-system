
/*******************************************************************************
   Copyright (c) Steven Nguyen 2021
   This file is part of the bot-rating-system repo

   Bot-rating-system is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   Bot-rating-system is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with bot-rating-system.  If not, see <https://www.gnu.org/licenses/>.
*******************************************************************************/

/// This rating system uses a modified version of the glicko2 rating system.
/// It uses various optimizations depending on the deterministicness of the
/// players and the ruleset.

/// Deterministicness
export const enum Dt {
   DETERMINISTIC, /// Dt,     Doesn't change over time  [alphabetical]
   RANDOM,        /// Non-Dt, Doesn't change over time  [random_mover]
   CHANGE,        /// Non-Dt, Does change over time     [human]
   VERSIONED,     /// Dt,     Does change over time     []
}

function isDeterministic(dtness: Dt) {
    return dtness === Dt.DETERMINISTIC || dtness === Dt.VERSIONED
}

// Deeply const
export const Defaults = {
   glicko2ScaleFactor: 173.7178,
   ratingInterval: 400,
   ratingValue: 1500,
   ratingDeviation: 350,
} as const

// Non constants - can change
/// Settings for the current Ruleset
/// Note the difference between Ruleset (chess) and Game (chess)
/// A game is like an instance of a ruleset
export const Ruleset = {
   ratingVolatility: 0.06,
   systemTau: 0.2,
   convergenceTolerance: 0.000001,
   deterministicness: Dt.DETERMINISTIC,
   orderMatters: true, // Is there a difference between being the first or second player?
}

export type ID = Readonly<number | string>
export type Result = Record<ID, number>
export type PlayerMap = Result
export type GameParticipants = Readonly<[Player, Player, ...Player[]]> // Array because maybe the order matters

export class Game {
   static totalGames = 0

   readonly id: ID
   startTime: number | null
   finishTime: number | null
   result: Result | null

   constructor (public readonly players: GameParticipants, id?: ID | null, startImmediately: boolean = false) {
      this.id = id ?? Game.totalGames

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

   finish (result: Result): number {
      if (this.finishTime !== null) {
         throw ReferenceError('Game already finished')
      }

      this.result = result
      updatePlayerRatings(this.players, result)
      return (this.finishTime = Date.now()) // intentional return assign
   }
}

export class Player {
   static totalPlayers: number = 0
   static getUniqueID () {
      return Player.totalPlayers
   }

   id: ID

   /// Games past or present
   games: Game[]

   rating: Glicko2Rating

   /// How a player did against other players
   outcome: {
      [key: ID]: Outcome
   }

   constructor (public dtness = Dt.CHANGE) {
      Player.totalPlayers++
      this.id = Player.getUniqueID()
      this.games = []
      this.rating = new Glicko2Rating(this)
      this.outcome = {}
   }

   // TODO: deterministicResult
   updateOutcome(isDeterministic: boolean, player2: Player, scoreAgainst: number, _players: GameParticipants) {
      if (player2.id in this.outcome) {
         this.outcome[player2.id].games++
         this.outcome[player2.id].total += scoreAgainst
         // TODO
      } else {
         this.outcome[player2.id] = {
            games: 1,
            total: scoreAgainst,
            deterministicResult: null, // TODO
         }
      }
   }
}

export class Bot extends Player {
   #version: Version
   previousVersions: Map<Version, Player>
   constructor (version?: Version | null, ...args: ConstructorParameters<typeof Player>) {
      super(...args)
      this.#version = version ?? new Version(0, 1, 0)
      this.previousVersions = new Map()
   }

   get version() {
       return this.#version
   }

   set version(version: Version) {
      const copy = Object.assign(Object.create(Player.prototype) as Player, this)
      this.previousVersions.set(this.#version, copy)
      this.#version = version
      Object.assign(this, new Player())
   }
}

export interface Outcome {
   games: number
   total: number /// Total score, where score = scoreThis / (scoreThis + scoreOther)
   deterministicResult: number | null
}

export class Rating {
   public value: number = Defaults.ratingValue
   constructor (public player: Player) {}

   /** Resets the rating */
   reset() {
      this.value = Defaults.ratingValue
   }
}

export class Glicko2Rating extends Rating {
   public deviation: number = Defaults.ratingDeviation
   public volatility: number = Ruleset.ratingVolatility

   override reset() {
      this.value = Defaults.ratingValue
      this.deviation = Defaults.ratingDeviation
      this.volatility = Ruleset.ratingVolatility
   }
}

export type VersionStr =
   | `${number}.${number}.${number}`
   | `${number}.${number}.${number}+${string}`
   | `${number}.${number}.${number}-${string}`
   | `${number}.${number}.${number}+${string}-${string}`

/**
 * SemVer implementation
 * 
 * If you disobey the semver spec, such as setting the major version to "1/2",
 * then all operations on the version have undefined functionality
 */
export class Version {
   major: number
   minor: number
   patch: number
   prerelease: string | null
   metadata: string | null

   // prerelease is only a suggestion. It's the part after a hyphen
   // metadata is only a suggestion. It's the part after a minus sign.
   constructor (major: number, minor: number, patch: number, prerelease?: string | null, metadata?: string | null) {
      if (!Number.isInteger(major)) {
         throw RangeError(`major version part given (${major}) is not an integer`)
      }
      if (!Number.isInteger(minor)) {
         throw RangeError(`minor version part given (${minor}) is not an integer`)
      }
      if (!Number.isInteger(patch)) {
         throw RangeError(`patch version part given (${patch}) is not an integer`)
      }

      if (major < 0) {
         throw RangeError(`major version part given (${major}) is less than zero`)
      }
      if (minor < 0) {
         throw RangeError(`minor version part given (${minor}) is less than zero`)
      }
      if (patch < 0) {
         throw RangeError(`patch version part given (${patch}) is less than zero`)
      }

      this.major = major
      this.minor = minor
      this.patch = patch
      this.prerelease = prerelease ?? null
      this.metadata = metadata ?? null
   }

   // So that you can use > and < to compare precedence
   valueOf (): string {
      let string = ''
      return string
   }

   toString (): VersionStr {
      let string: VersionStr = `${this.major}.${this.minor}.${this.patch}` as const
      if (this.prerelease !== null) {
         string = `${string}+${this.prerelease}` as const
      }
      if (this.metadata !== null) {
         string = `${string}-${this.metadata}` as const
      }
      return string
   }
}

function updatePlayerRatings (players: GameParticipants, result: Result): void {
   const resultIsDeterministic =
      Ruleset.orderMatters === false && // TODO: Support different orders
      isDeterministic(Ruleset.deterministicness) &&
      players.every(player => isDeterministic(player.dtness))

   for (const playerA of players) {
      for (const playerB of players) {
         if (playerA === playerB) {
            continue
         }

         playerA.updateOutcome(resultIsDeterministic, playerB, result[playerA.id] / (result[playerA.id] + result[playerB.id]), players)
         playerB.updateOutcome(resultIsDeterministic, playerA, result[playerB.id] / (result[playerA.id] + result[playerB.id]), players)
      }
   }

   const μ = Object.fromEntries(players.map(player => [player.id, (player.rating.value - Defaults.ratingValue) / Defaults.glicko2ScaleFactor]))
   const φ = Object.fromEntries(players.map(player => [player.id, player.rating.deviation / Defaults.glicko2ScaleFactor]))
   const σ = Object.fromEntries(players.map(player => [player.id, player.rating.volatility]))

   // Use glicko2 for now
   // Step 1: Initialize all player rating stats (done)

   // Step 2:
   for (const player of players) {
      const opponentIDs = Object.keys(result).filter(id => String(id) !== String(player.id))

      const playerμ = μ[player.id]
      const playerφ = φ[player.id]
      const playerσ = σ[player.id]

      // doing step 6 if no games happened
      // (Object.keys(scores).length === 0) === (opponentIDs.length === 0)
      if (opponentIDs.length === 0) {
         const pre_playerφ = Math.sqrt(__squared(playerφ) + __squared(playerσ))
         const new_playerφ = pre_playerφ
         const new_playerRD = Defaults.glicko2ScaleFactor * new_playerφ
         player.rating.deviation = new_playerRD
         continue;
      }

      // Optimization - moved this part of step 2 over here
      const relativeScores = {} as Record<ID, number>
      const gφ = {} as Record<ID, number>
      for (const ID of opponentIDs) {
         relativeScores[ID] = result[player.id] / (result[player.id] + result[ID])
         gφ[ID] = _g(φ[ID])
      }

      // Step 3 + Optimization
      const [v, Eparts] = _v(μ, gφ, σ, player, opponentIDs)

      // Step 4:
      const sigmaOptimization = opponentIDs.reduce((total: number, id: ID) => gφ[id] * (relativeScores[id] - Eparts[id]), 0)
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
         while (_f(a - (k * Ruleset.systemTau), delta, playerφ, v, a) < 0) {
            k++
         }

         B = a - (k * Ruleset.systemTau)
      }

      // Step 5.3
      let fA = _f(A, delta, playerφ, v, a)
      let fB = _f(B, delta, playerφ, v, a)

      // Step 5.4
      while (Math.abs(B - A) > Ruleset.convergenceTolerance) {
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

/// Estimated variance of a rating based on game outcomes
/// (The actual formula only uses the stats of the opponents that were played)
function _v (μ: PlayerMap, gφ: PlayerMap, σ: PlayerMap, player: Player, opponentIDs: ID[]): [number, Record<ID, number>] {
   // [Σ g(opponent φ)² * E(player μ, opponent μ, opponent φ) * (1 - E(player μ, opponent μ, opponent φ))] ^ -1

   let total = 0
   const Eparts = [] as [ID, number][]

   opponentIDs.forEach((id: ID) => {
      const Epart = _E_optimization(player.rating.value, μ[id], gφ[id])
      total += gφ[id] * gφ[id] * Epart * (1 - Epart)
      Eparts.push([id, Epart])
   })

   return [1 / total, Object.fromEntries(Eparts)] // Same as total ** -1
}

function _gSquared (φ: number) {
   // g(φ) = 1 / sqrt(stuff)
   // g(φ)² = 1 / stuff
   return 1 / (1 + (3 * __squared(φ / Math.PI)))
}

function _g (φ: number) {
   return 1 / Math.sqrt(1 + (3 * __squared(φ / Math.PI)))
}

/* Unused */
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
      ((e2TheX * (__squared(delta) - tempPart)) / (2 * __squared(tempPart))) - ((x - a) / __squared(Ruleset.systemTau))
   )
}

function __squared(n: number) {
   return n * n
}
