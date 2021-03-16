// This file is part of the js-python-chess package, which is mostly
// derived from the python-chess library
//
// This file happens to not be directly derived from the
// python-chess library
//
// Copyright (C) 2021 Steven Nguyen <icecream17.github@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

const chalk = require('chalk')

// const args = process.argv.slice(2)

const log = console.log
const bold = chalk.bold
const success = bold.green

log(bold('Result: ') + success(' PASSED!!! ') + '\n')
