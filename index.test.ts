
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

import { Defaults, DtNess, Ruleset, Player, Bot, Glicko2Rating as Rating, Version, Game, Result } from './index'
import Glicko2 from './verified-glicko2'

describe('Defaults', () => {
   test('Values which cannot be changed', () => {
      expect(Defaults.glicko2ScaleFactor).toBe(173.7178)
      expect(Defaults.ratingInterval).toBe(400)
      expect(Defaults.ratingValue).toBe(1500)
      expect(Defaults.ratingDeviation).toBe(350)
   })

   test('Not totally wrong', () => {
      const system = new Ruleset()
      expect(system.ratingVolatility).toBeGreaterThan(0)
      expect(system.ratingVolatility).toBeLessThan(1000)
      expect(system.systemTau).toBeGreaterThanOrEqual(0)
      expect(system.systemTau).toBeLessThan(5)
      expect(system.convergenceTolerance).toBeGreaterThanOrEqual(0)
      expect(system.convergenceTolerance).toBeLessThanOrEqual(0.000001)

      expect(system.ratingInterval).toBeGreaterThan(0)
      expect(system.ratingInterval).not.toBe(Infinity)
   })
})

describe('System', () => {
   const system = new Ruleset()
   const playerA = system.Bot(DtNess.RANDOM)
   const playerB = system.Bot(DtNess.RANDOM)

   const glicko = new Glicko2({
      tau: system.systemTau,
      rating: Defaults.ratingValue,
      rd: Defaults.ratingDeviation,
      vol: system.ratingVolatility,
      precision: system.convergenceTolerance,
   })
   const glickoA = glicko.makePlayer()
   const glickoB = glicko.makePlayer()

   test('New players have a rating', () => {
      expect(playerA.rating).toBeInstanceOf(Rating)
      expect(playerB.rating).toBeInstanceOf(Rating)
   })

   test('Different players have different ids', () => {
      expect(playerA.id).not.toBe(playerB.id)
   })

   test("Volatility is the same", () => {
      expect(playerA.rating.volatility).toBe(system.ratingVolatility)
      expect(playerA.rating.volatility).toBeCloseTo(glickoA.getVol())
   })

   /// Also checking if the glicko2 implementation is valid
   test('If A vs B and A wins, A.rating > B.rating', () => {
      const game1 = system.Game([playerA, playerB], true)
      game1.finish([1, 0])

      expect(playerA.rating.value).toBeGreaterThan(playerB.rating.value)
   })

   test('Same as verified-glicko2 (1)', () => {

      glicko.updateRatings([[glickoA, glickoB, 1]])

      expect(playerA.rating.volatility).toBeCloseTo(glickoA.getVol())
      expect(playerA.rating.value).toBeCloseTo(glickoA.getRating())
      expect(playerB.rating.value).toBeCloseTo(glickoB.getRating())
   })

   test('After A wins once, if B wins twice, B.rating > A.rating', () => {
      console.debug = () => {};

      const game2 = system.Game([playerA, playerB], true)
      game2.finish([0, 1])

      const game3 = system.Game([playerA, playerB], true)
      game3.finish([0, 1])

      expect(playerB.rating.value).toBeGreaterThan(playerA.rating.value)
   })

   // One rating period is different from two
   test.skip('Same as verified-glicko2 (2)', () => {
      glicko.updateRatings([[glickoA, glickoB, 0], [glickoA, glickoB, 0]])

      expect(playerA.rating.value).toBeCloseTo(glickoA.getRating())
      expect(playerB.rating.value).toBeCloseTo(glickoB.getRating())
   })

   test('After ABBA, A.rating === B.rating', () => {
      const game4 = system.Game([playerA, playerB], true)
      game4.finish([1, 0])

      expect(playerA.rating.value).toBeCloseTo(playerB.rating.value)
   })

   test.skip('Same as verified-glicko2 (3)', () => {
      glicko.updateRatings([[glickoA, glickoB, 1]])

      expect(playerA.rating.value).toBeCloseTo(glickoA.getRating())
      expect(playerB.rating.value).toBeCloseTo(glickoB.getRating())
   })

   test("If two deterministic games have different results there's an error", () => {
      console.error = jest.fn()
      const dtA = system.Bot(DtNess.DETERMINISTIC)
      const dtB = system.Bot(DtNess.DETERMINISTIC)
      system.Game([dtA, dtB], true).finish([1, 0])
      expect(() => {
         system.Game([dtA, dtB], true).finish([0, 1])
      }).toThrow()
   })

   test('random < plusPtOne < plusPtTwo', () => {
      const random = system.Bot(DtNess.RANDOM, new Version(1, 0, 1))
      const plusPtOne = system.Bot(DtNess.RANDOM, new Version(1, 0, 1))
      const plusPtTwo = system.Bot(DtNess.RANDOM, new Version(1, 0, 1))

      const totalscores = [0, 0, 0]
      for (let i = 0; i < 42; i++) {
         const game5thru104 = system.Game([random, plusPtOne, plusPtTwo], true)

         // Notice how the scores are not adjusted
         const scores = [Math.random(), Math.random() + .01, Math.random() + .02] as const
         totalscores[0] += scores[0]
         totalscores[1] += scores[1]
         totalscores[2] += scores[2]
         game5thru104.finish(scores)
      }

      console.info({
         random: random.rating.value,
         plusPtOne: plusPtOne.rating.value,
         plusPtTwo: plusPtTwo.rating.value,
         totalscores,
      })

      const r = expect(random.rating.value)
      if (totalscores[0] < totalscores[1]) {
         r.toBeLessThan(plusPtOne.rating.value)
      } else {
         r.toBeGreaterThanOrEqual(plusPtOne.rating.value)
      }
      if (totalscores[0] < totalscores[2]) {
         r.toBeLessThan(plusPtTwo.rating.value)
      } else {
         r.toBeGreaterThanOrEqual(plusPtTwo.rating.value)
      }
      if (totalscores[1] < totalscores[2]) {
         expect(plusPtOne.rating.value).toBeLessThan(plusPtTwo.rating.value)
      } else {
         expect(plusPtOne.rating.value).toBeGreaterThanOrEqual(plusPtTwo.rating.value)
      }
   })
})
