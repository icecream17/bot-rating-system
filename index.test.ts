
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

import { Defaults, Player, Bot, Rating, Version, Game, Result } from './index'

describe('Defaults', () => {
   test('Not totally wrong', () => {
      expect(Defaults.ratingCertaintyCoefficient).toBeGreaterThan(0)
      expect(Defaults.ratingCertaintyCoefficient).toBeLessThanOrEqual(1)
      expect(Defaults.ratingInterval).not.toBe(Infinity)
      expect(Defaults.ratingInterval).not.toBe(-Infinity)
      expect(Defaults.ratingInterval).not.toBe(NaN)
      expect(Defaults.ratingValue).not.toBe(Infinity)
      expect(Defaults.ratingValue).not.toBe(-Infinity)
      expect(Defaults.ratingValue).not.toBe(NaN)
      expect(Defaults.ratingK).not.toBe(Infinity)
      expect(Defaults.ratingK).not.toBe(-Infinity)
      expect(Defaults.ratingK).not.toBe(NaN)
   })
})

describe('System', () => {
   const playerA = new Bot()
   const playerB = new Bot()

   test('New players havve a rating', () => {
      expect(playerA.rating).toBeInstanceOf(Rating)
      expect(playerB.rating).toBeInstanceOf(Rating)
   })

   test('Different players have different ids', () => {
      expect(playerA.id).not.toBe(playerB.id)
   })

   test('If A vs B and A wins, A.rating > B.rating', () => {
      const game1 = new Game([playerA, playerB], undefined, true)
      game1.finish([1, 0])

      expect(playerA.rating.value).toBeGreaterThan(playerB.rating.value)
   })

   test('After A wins once, if B wins twice, B.rating > A.rating', () => {
      const game2 = new Game([playerA, playerB], undefined, true)
      game2.finish([0, 1])

      const game3 = new Game([playerA, playerB], undefined, true)
      game3.finish([0, 1])

      expect(playerB.rating.value).toBeGreaterThan(playerA.rating.value)
   })

   test('After ABBA, A.rating === B.rating', () => {
      const game4 = new Game([playerA, playerB], undefined, true)
      game4.finish([1, 0])

      expect(playerA.rating.value).toBeCloseTo(playerB.rating.value)
   })

   const random = new Bot(null, new Version(1, 0, 0))
   const plusPtOne = new Bot(null, new Version(1, 0, 0))
   const plusPtTwo = new Bot(null, new Version(1, 0, 0))

   test('random < plusPtOne < plusPtTwo', () => {
      for (let i = 0; i < 100; i++) {
         const game5thru104 = new Game([random, plusPtOne, plusPtTwo], undefined, true)
         const scores = [Math.random(), Math.random() + 0.1, Math.random() + 0.2] as const
         const total = scores[0] + scores[1] + scores[2]
         // @ts-expect-error seriously?
         game5thru104.finish(scores.map(score => score / total) as readonly [number, number, number])
      }

      console.info({
         random: random.rating.value,
         plusPtOne: plusPtOne.rating.value,
         plusPtTwo: plusPtTwo.rating.value,
         certainty: random.rating.certaintyAgainstPlayers([plusPtOne, plusPtTwo])
      })

      expect(random.rating.value).toBeLessThan(plusPtOne.rating.value)
      expect(plusPtOne.rating.value).toBeLessThan(plusPtTwo.rating.value)
   })
})
