
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

import { Defaults } from './index'

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
