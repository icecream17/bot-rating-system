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

const enum DtFlags {
   DETERMINISTIC = 1,
   CHANGES_OVER_TIME = 2,
}

export const enum DtNess {
   RANDOM, /// [random_mover]
   DETERMINISTIC = DtFlags.DETERMINISTIC, /// [alphabetical]
   CHANGE = DtFlags.CHANGES_OVER_TIME, /// [human]
   VERSIONED = DtFlags.DETERMINISTIC & DtFlags.CHANGES_OVER_TIME,
}

function isFlag(dtness: DtNess, flag: DtFlags) {
   return (dtness & flag) === flag
}

// Deeply const
export const Defaults = {
   glicko2ScaleFactor: 173.7178,
   ratingInterval: 400,
   ratingValue: 1500,
   ratingDeviation: 350,
} as const

/// ConstructorParameters but leave out the first param
type SubConstrParam<T extends abstract new (...args: any) => any> =
   T extends abstract new (...args: [any, ...infer R]) => any ? R : never

type Timestamp = ReturnType<typeof Date.now>
type RatingGroup = Game[]

// Non constants - can change
/// Note the difference between Ruleset (chess) and Game (chess)
/// A game is like an instance of a ruleset
/// Though in this case you call Ruleset.Game
export class Ruleset {
   /// Settings for the current Ruleset
   public readonly ratingVolatility = 0.06
   public readonly systemTau = 0.2
   public readonly convergenceTolerance = 0.000001

   public readonly ratingInterval = 1000 * 60 * 60 * 24
   public readonly firstIntervalTimestamp = new Date(
      new Date().toDateString()
   ).getTime()

   /// Ruleset data
   public games = new Set<Game>()
   public players = new Set<Player>()
   public ratingGroups = {
      /// Contains all deterministic games to be processed as one group
      deterministic: [] as RatingGroup,

      /// Contains all non-deterministic games in multiple groups
      nonDeterministic: new Map<Timestamp, RatingGroup>(),
   }

   constructor(
      /// Does the game always do the same thing given the same actions by players?
      public deterministic = true,
      /// Does the order of the players matter?
      public orderMatters = true
   ) {}

   /// Creates a new game of the ruleset
   Game(...args: SubConstrParam<typeof Game>) {
      const game = new Game(this, ...args)
      this.games.add(game)
      return game
   }

   /// Creates a new player of the ruleset
   Player(...args: SubConstrParam<typeof Player>) {
      const player = new Player(this, ...args)
      this.players.add(player)
      return player
   }

   /// Creates a new bot of the ruleset
   Bot(...args: SubConstrParam<typeof Bot>) {
      const bot = new Bot(this, ...args)
      this.players.add(bot)
      return bot
   }

   /// Internal
   _updateGameFinished(game: Game) {
      if (game.isDeterministic()) {
         this._updateDeterministicGameFinished(game)
      } else {
         const timestamp = game.timestamp
         if (timestamp < this.firstIntervalTimestamp) {
            throw TypeError("The game was before the first game interval")
         }

         let lastRgTimestamp = [
            ...this.ratingGroups.nonDeterministic.keys(),
         ].find(
            (rgTimestamp) =>
               rgTimestamp < timestamp &&
               timestamp < rgTimestamp + this.ratingInterval
         )
         if (lastRgTimestamp === undefined) {
            lastRgTimestamp =
               Math.floor(
                  (timestamp - this.firstIntervalTimestamp) /
                     this.ratingInterval
               ) * this.ratingInterval
            this.ratingGroups.nonDeterministic.set(lastRgTimestamp, [])
         }

         this.ratingGroups.nonDeterministic.get(lastRgTimestamp)!.push(game)
      }
   }

   /// Internal
   _updateDeterministicGameFinished(game: Game) {
      for (const other of this.ratingGroups.deterministic) {
         if (!(other.players.length === game.players.length)) {
            continue
         }
         if (this.orderMatters) {
            if (
               other.players.every(
                  (player, index) =>
                     game.players[index] === player &&
                     other.result![player.id] === game.result![player.id]
               )
            ) {
               return "duplicate"
            }
         } else {
         }
      }
      this.ratingGroups.deterministic.push(game)
      return "not duplicate"
   }
}

export type ID = Readonly<number | string>
export type Result = Record<ID, number>
export type PlayerMap = Result
export type GameParticipants = Readonly<[Player, Player, ...Player[]]> // Array because maybe the order matters

/// Score != Result
///
/// For example if PlayerA, PlayerA, and PlayerB get scores `[2, 3, 4]`
/// then the result is `{ [PlayerA.id]: 2.5 / 6.5, [PlayerB.id]: 4 / 6.5 }`
export type Scores =
   | [number, number, ...number[]]
   | readonly [number, number, ...number[]]
function convertScoresToResult(
   players: GameParticipants,
   scores: Scores
): Result {
   const playerScores = {} as Record<ID, number[]>
   for (const [index, score] of scores.entries()) {
      playerScores[players[index].id] ??= []
      playerScores[players[index].id].push(score)
   }

   const results = {} as Result
   for (const id in playerScores) {
      results[id] = __sum(playerScores[id]) / playerScores[id].length
   }
   return results
}

export class Game {
   startTime: number | null
   finishTime: number | null
   scores: Scores | null
   result: Result | null

   constructor(
      public readonly ruleset: Ruleset,
      public readonly players: GameParticipants,
      startImmediately: boolean = false
   ) {
      this.startTime = startImmediately ? Date.now() : null
      this.finishTime = null
      this.scores = null
      this.result = null

      for (const player of players) {
         if (player.ruleset !== ruleset) {
            console.error({ player, ruleset })
            throw new TypeError(
               "The player's ruleset is different from this game's ruleset"
            )
         }
         if (!player.games.includes(this)) {
            player.games.push(this)
         }
      }
   }

   start(): number {
      if (this.startTime !== null) {
         throw ReferenceError("Game already started")
      }

      return (this.startTime = Date.now()) // intentional return-assign
   }

   finish(scores: Scores): number {
      if (this.finishTime === null) {
         this.finishTime = Date.now()
      } else {
         throw ReferenceError("Game already finished")
      }

      this.scores = scores
      this.result = convertScoresToResult(this.players, scores)
      this.ruleset._updateGameFinished(this)
      return this.finishTime
   }

   isDeterministic() {
      return (
         this.ruleset.deterministic &&
         this.players.every((player) => player.isDeterministic())
      )
   }

   /// Custom timestamp criteria
   get timestamp(): Timestamp {
      if (this.startTime === null || this.finishTime === null) {
         throw new TypeError("Game not finished!!!")
      }
      return (this.startTime + this.finishTime) / 2
   }
}

export class Player {
   static nextID = 0

   /// Arbitrary unique player hash for rating calculation
   id: ID

   /// Games past or present
   games: Game[]

   rating: Glicko2Rating

   constructor(public ruleset: Ruleset, public dtness = DtNess.CHANGE) {
      this.id = Player.nextID++
      this.games = []
      this.rating = new Glicko2Rating(this)
   }

   isDeterministic() {
      return isFlag(this.dtness, DtFlags.DETERMINISTIC)
   }
}

export class Bot extends Player {
   #version: Version
   constructor(
      ruleset: Ruleset,
      version?: Version | null,
      public versions: Map<Version, Player> = new Map()
   ) {
      super(ruleset, DtNess.VERSIONED)
      this.#version = version ?? new Version(0, 1, 0)
      if (!this.versions.has(this.#version)) {
         this.versions.set(this.#version, this)
      }
   }

   get version() {
      return this.#version
   }

   newVersion(version: Version) {
      return this.ruleset.Bot(version, this.versions)
   }
}

export interface Outcome {
   games: number
   total: number /// Total score, where score = scoreThis / (scoreThis + scoreOther)
   deterministicResult: number | null
}

export class Glicko2Rating {
   public deviation: number = Defaults.ratingDeviation
   public value: number = Defaults.ratingValue
   public volatility: number
   constructor(public player: Player) {
      this.volatility = player.ruleset.ratingVolatility
   }

   /** Resets the rating */
   reset() {
      this.value = Defaults.ratingValue
      this.deviation = Defaults.ratingDeviation
      this.volatility = this.player.ruleset.ratingVolatility
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
 * If you provide an incomplaint semver string, such as "1/2",
 * then all functionality is UB (undefined behavior)
 */
export class Version {
   major: number
   minor: number
   patch: number

   /// May be indicated by appending a hyphen followed by dot separated identifiers
   prerelease: string | null

   /// May be indicated by appending a plus sign followed by dot separated identifiers
   metadata: string | null

   constructor(
      major: number,
      minor: number,
      patch: number,
      prerelease?: string | null,
      metadata?: string | null
   ) {
      if (!Number.isInteger(major)) {
         throw RangeError(
            `major version part given (${major}) is not an integer`
         )
      }
      if (!Number.isInteger(minor)) {
         throw RangeError(
            `minor version part given (${minor}) is not an integer`
         )
      }
      if (!Number.isInteger(patch)) {
         throw RangeError(
            `patch version part given (${patch}) is not an integer`
         )
      }

      if (major < 0) {
         throw RangeError(
            `major version part given (${major}) is less than zero`
         )
      }
      if (minor < 0) {
         throw RangeError(
            `minor version part given (${minor}) is less than zero`
         )
      }
      if (patch < 0) {
         throw RangeError(
            `patch version part given (${patch}) is less than zero`
         )
      }

      this.major = major
      this.minor = minor
      this.patch = patch
      this.prerelease = prerelease ?? null
      this.metadata = metadata ?? null
   }

   // So that you can use > and < to compare precedence
   valueOf(): string {
      let string = ""
      return string
   }

   toString(): VersionStr {
      let string: VersionStr =
         `${this.major}.${this.minor}.${this.patch}` as const
      if (this.prerelease !== null) {
         string = `${string}+${this.prerelease}` as const
      }
      if (this.metadata !== null) {
         string = `${string}-${this.metadata}` as const
      }
      return string
   }
}

function iteratorEvery<T>(
   iterable: Iterable<T>,
   callback: (val: T) => boolean
) {
   for (const value of iterable) {
      if (!callback(value)) {
         return false
      }
   }
   return true
}

function updatePlayerRatingsUsingRatingGroup(
   ruleset: Ruleset,
   result: Result
): void {
   const players = ruleset.players
   const resultIsDeterministic =
      ruleset.orderMatters === false && // TODO: Support different orders
      ruleset.deterministic &&
      iteratorEvery(players, (player) => player.isDeterministic())

   // Use Glicko-2 for now
   // Step 1: Initialize all player rating stats (done)

   // Step 2: Convert ratings and RD's onto the Glicko-2 scale
   const μ = {} as Record<ID, number>
   const φ = {} as Record<ID, number>
   const σ = {} as Record<ID, number>
   for (const player of players) {
      μ[player.id] =
         (player.rating.value - Defaults.ratingValue) /
         Defaults.glicko2ScaleFactor
      φ[player.id] = player.rating.deviation / Defaults.glicko2ScaleFactor
      σ[player.id] = player.rating.volatility
   }

   for (const player of players) {
      // Step 2 continued: Setup variables
      const playerμ = μ[player.id]
      const playerφ = φ[player.id]
      const playerσ = σ[player.id]

      // TODO: Game intervals
      //       // If no games do Step 6
      //       // Object.keys(scores).length === opponentIDs.length
      const opponentIDs = ((iter, item) => {
         return {
            next(): IteratorResult<ID, any> {
               const next = iter.next()
               if (next.done) {
                  return next
               } else if (next.value !== item) {
                  return { done: false, value: next.value.id }
               }
               return this.next()
            },
            [Symbol.iterator]() {
               return this
            },
         }
      })(players.values(), player)
      //       if (opponentIDs.length === 0) {
      //          const pre_playerφ = Math.sqrt(__squared(playerφ) + __squared(playerσ))
      //          const new_playerφ = pre_playerφ
      //          const new_playerRD = Defaults.glicko2ScaleFactor * new_playerφ
      //          player.rating.deviation = new_playerRD
      //          continue;
      //       }

      // Step 2 continued: Setup scores + Setup gφ optimization
      const relativeScores = {} as Record<ID, number>
      const gφ = {} as Record<ID, number>
      for (const ID of opponentIDs) {
         relativeScores[ID] =
            result[player.id] / (result[player.id] + result[ID])
         gφ[ID] = _g(φ[ID])
      }

      // Step 3 + Optimization
      // Estimated variance
      const [v, Eparts] = _v(μ, gφ, playerμ, opponentIDs)

      // Step 4:
      const sigmaOptimization = (() => {
         let total = 0
         for (const id of opponentIDs) {
            total += gφ[id] * (relativeScores[id] - Eparts[id])
         }
         return total
      })()
      const delta = v * sigmaOptimization // Because of optimization this is only used once

      // First some _f_optimization
      const playerφSquared = __squared(playerφ)
      const deltaSquared = __squared(delta)
      const systemTauSquared = __squared(ruleset.systemTau)

      // Step 5.1:
      const a = Math.log(playerφSquared)

      // Step 5.2:
      let A: number = a
      let B: number

      const φφPlusV = playerφSquared + v
      if (deltaSquared > φφPlusV) {
         B = Math.log(deltaSquared - φφPlusV)
      } else {
         let kTimesSystemTau = ruleset.systemTau
         while (
            _f_optimization(
               a - kTimesSystemTau,
               deltaSquared,
               playerφSquared,
               v,
               a,
               systemTauSquared
            ) < 0
         ) {
            kTimesSystemTau += ruleset.systemTau
         }

         B = a - kTimesSystemTau
      }

      // Step 5.3
      let fA = _f_optimization(
         A,
         deltaSquared,
         playerφSquared,
         v,
         a,
         systemTauSquared
      )
      let fB = _f_optimization(
         B,
         deltaSquared,
         playerφSquared,
         v,
         a,
         systemTauSquared
      )

      // Step 5.4
      while (Math.abs(B - A) > ruleset.convergenceTolerance) {
         // 5.4a
         const C = A + ((A - B) * fA) / (fB - fA)
         const fC = _f_optimization(
            C,
            deltaSquared,
            playerφSquared,
            v,
            a,
            systemTauSquared
         )

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
      const pre_playerφ = Math.sqrt(playerφSquared + __squared(new_playerσ))

      // Step 7
      const new_playerφ = 1 / Math.sqrt(1 / __squared(pre_playerφ) + 1 / v)
      const new_playerμ = playerμ + __squared(new_playerφ) * sigmaOptimization

      // Step 8
      const new_playerRating =
         Defaults.glicko2ScaleFactor * new_playerμ + Defaults.ratingValue
      const new_playerRD = Defaults.glicko2ScaleFactor * new_playerφ

      player.rating.value = new_playerRating
      player.rating.deviation = new_playerRD
      player.rating.volatility = new_playerσ
   }
}

/// Estimated variance of a rating based on game outcomes and opponent stats
/// Returns [variance result, EpartsOptimization]
function _v(
   μ: PlayerMap,
   gφ: PlayerMap,
   playerμ: number,
   opponentIDs: Iterable<ID>
): [number, Record<ID, number>] {
   // [Σ g(opponent φ)² * E(player μ, opponent μ, opponent φ) * (1 - E(player μ, opponent μ, opponent φ))] ^ -1
   // 1 / [Σ gφ² * Epart * (1 - Epart)]

   let total = 0
   const Eparts = {} as Record<ID, number>

   for (const id of opponentIDs) {
      const Epart = _E_optimization(playerμ, μ[id], gφ[id])
      total += gφ[id] * gφ[id] * Epart * (1 - Epart)
      Eparts[id] = Epart
   }

   return [1 / total, Eparts]
}

/* Unused */
function _gSquared(φ: number) {
   // g(φ) = 1 / sqrt(stuff)
   // g(φ)² = 1 / stuff
   return 1 / (1 + 3 * __squared(φ / Math.PI))
}

function _g(φ: number) {
   // Optimization: φ²/π² === (φ/π)²
   return 1 / Math.sqrt(1 + 3 * __squared(φ / Math.PI))
}

/* Unused */
function _E(μ: number, μj: number, φj: number) {
   return 1 / (1 + Math.exp(-1 * _g(φj) * (μ - μj)))
}

function _E_optimization(μ: number, μj: number, gφj: number) {
   return 1 / (1 + Math.exp(-1 * gφj * (μ - μj)))
}

function _f_optimization(
   x: number,
   deltaSquared: number,
   playerφSquared: number,
   v: number,
   a: number,
   systemTauSquared: number
) {
   const e2TheX = Math.E ** x
   const tempPart = playerφSquared + v + e2TheX
   return (
      (e2TheX * (deltaSquared - tempPart)) / (2 * __squared(tempPart)) -
      (x - a) / systemTauSquared
   )
}

/* Unused */
function _f(
   x: number,
   delta: number,
   playerφ: number,
   v: number,
   a: number,
   systemTau: number
) {
   const e2TheX = Math.E ** x
   const tempPart = __squared(playerφ) + v + e2TheX
   return (
      (e2TheX * (__squared(delta) - tempPart)) / (2 * __squared(tempPart)) -
      (x - a) / __squared(systemTau)
   )
}

function __squared(n: number) {
   return n * n
}

function __sum(a: number[]) {
   return a.reduce((b, c) => b + c)
}
