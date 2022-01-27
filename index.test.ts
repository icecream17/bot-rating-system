
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

import { Defaults, Dt, Player, Bot, Rating, Version, Game, Result, Ruleset } from './index'
import Glicko2 from './verified-glicko2'

describe('Defaults', () => {
   test('Values which cannot be changed', () => {
      expect(Defaults.glicko2ScaleFactor).toBe(173.7178)
      expect(Defaults.ratingInterval).toBe(400)
      expect(Defaults.ratingValue).toBe(1500)
      expect(Defaults.ratingDeviation).toBe(350)
   })

   test('Not totally wrong', () => {
      expect(Ruleset.ratingVolatility).toBeGreaterThan(0)
      expect(Ruleset.ratingVolatility).toBeLessThan(1000)
      expect(Ruleset.systemTau).toBeGreaterThanOrEqual(0)
      expect(Ruleset.systemTau).toBeLessThan(5)
      // expect(Defaults.systemRatingPeriodLength).toBeGreaterThan(0)
      // expect(Defaults.systemRatingPeriodLength).not.toBe(Infinity)
      expect(Ruleset.convergenceTolerance).toBeGreaterThanOrEqual(0)
      expect(Ruleset.convergenceTolerance).toBeLessThanOrEqual(0.000001)
   })
})

describe('System', () => {
   const playerA = new Bot(null, Dt.CHANGE)
   const playerB = new Bot(null, Dt.CHANGE)
   const ranking = new Glicko2({
      tau: Ruleset.systemTau,
      rating: Defaults.ratingValue,
      rd: Defaults.ratingDeviation,
      vol: Ruleset.ratingVolatility,
   })
   const glickoA = ranking.makePlayer()
   const glickoB = ranking.makePlayer()

   test('New players have a rating', () => {
      expect(playerA.rating).toBeInstanceOf(Rating)
      expect(playerB.rating).toBeInstanceOf(Rating)
   })

   test('Different players have different ids', () => {
      expect(playerA.id).not.toBe(playerB.id)
   })

   /// Also checking if the glicko2 implementation is valid
   test('If A vs B and A wins, A.rating > B.rating', () => {
      const game1 = new Game([playerA, playerB], true)
      game1.finish({
         [playerA.id]: 1,
         [playerB.id]: 0,
      })

      ranking.updateRatings([[glickoA, glickoB, 1]])

      expect(playerA.rating.value).toBeCloseTo(glickoA.getRating())
      expect(playerB.rating.value).toBeCloseTo(glickoB.getRating())
      expect(playerA.rating.value).toBeGreaterThan(playerB.rating.value)
   })

   test('After A wins once, if B wins twice, B.rating > A.rating', () => {
      const game2 = new Game([playerA, playerB], true)
      game2.finish({
         [playerA.id]: 0,
         [playerB.id]: 1,
      })

      const game3 = new Game([playerA, playerB], true)
      game3.finish({
         [playerA.id]: 0,
         [playerB.id]: 1,
      })

      ranking.updateRatings([[glickoA, glickoB, 0], [glickoA, glickoB, 0]])

      expect(playerA.rating.value).toBeCloseTo(glickoA.getRating())
      expect(playerB.rating.value).toBeCloseTo(glickoB.getRating())
      expect(playerB.rating.value).toBeGreaterThan(playerA.rating.value)
   })

   test('After ABBA, A.rating === B.rating', () => {
      const game4 = new Game([playerA, playerB], true)
      game4.finish({
         [playerA.id]: 1,
         [playerB.id]: 0,
      })

      ranking.updateRatings([[glickoA, glickoB, 1]])

      expect(playerA.rating.value).toBeCloseTo(glickoA.getRating())
      expect(playerB.rating.value).toBeCloseTo(glickoB.getRating())
      expect(playerA.rating.value).toBeCloseTo(playerB.rating.value)
   })

   test('random < plusPtOne < plusPtTwo', () => {
      const random = new Bot(new Version(1, 0, 1))
      const plusPtOne = new Bot(new Version(1, 0, 1))
      const plusPtTwo = new Bot(new Version(1, 0, 1))

      const totalscores = [0, 0, 0]
      for (let i = 0; i < 100; i++) {
         const game5thru104 = new Game([random, plusPtOne, plusPtTwo], true)
         const scores = [Math.random(), Math.random() + 0.1, Math.random() + 0.2] as const
         const total = scores[0] + scores[1] + scores[2]
         totalscores[0] += scores[0] / total
         totalscores[1] += scores[1] / total
         totalscores[2] += scores[2] / total
         game5thru104.finish({
            [random.id]: scores[0] / total,
            [plusPtOne.id]: scores[1] / total,
            [plusPtTwo.id]: scores[2] / total,
         })
      }

      console.info({
         random: random.rating.value,
         plusPtOne: plusPtOne.rating.value,
         plusPtTwo: plusPtTwo.rating.value,
         totalscores,
      })

      expect(random.rating.value).toBeLessThan(plusPtOne.rating.value)
      expect(plusPtOne.rating.value).toBeLessThan(plusPtTwo.rating.value)
   })
})
