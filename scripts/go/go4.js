/** @param {NS} ns */
export async function main(ns) {
  const opponents = [
  "Netburners", 
  // "Slum Snakes", 
  "The Black Hand", 
  // "Tetrads", 
  "Daedalus",
  "Illuminati"
  ];

  let gameCounter = 0;
  game: while(true) {   
    if(gameCounter > 10000) {
      ns.alert("Too many games reached!");
      return;
    }
    let boardState = ns.go.resetBoardState(opponents[gameCounter++ % opponents.length], 13);

    let aiTime = 0;
    let state = {};
    state.stage = 1;
    state.candidate = null;
    state.eyes = [];
    state.eyePoints = [];
    parseGrid(boardState, state);

    let turnCounter = 0;
    while(true) {
      if(ns.go.getCurrentPlayer() == 'None') {
        continue game;
      }
      if(turnCounter++ > 5000) {
        await(ns.prompt("Infinite main cycle"));
        state.stage = 667;
      }
      let boardState = ns.go.getBoardState();
      parseGrid(boardState, state);
      if(state.stage == 1) { // Building a base shaft
        let terminate = await(processBase(ns, state, aiTime));
        if(terminate) {
          continue;
        }
      }
      if(state.stage == 2) { // Building base columns
        let terminate = await(processColumns(ns, state, aiTime));
        if(terminate) {
          continue;
        }
      }
      if(state.stage == 3) { // Expanding
        let terminate = await(processExpansion(ns, state, aiTime));
        if(terminate) {
          continue;
        }
      }
      if(state.stage == 4) { // Cleaning up the base
        let terminate = await(processBaseCleanup(ns, state, aiTime));
        if(terminate) {
          continue;
        }
      }
      if(state.stage == 5) { // Carpet bombing
        let terminate = await(processFill(ns, state, aiTime));
        if(terminate) {
          continue;
        }
      }
      if(state.stage == 666) { // Stable base has not been built, game restart
        await(ns.sleep(500)); // Board generation is seeded by time, so creating new game immediately
                              // leads to a same board and potential infinite loop if no candidate
                              // spaces are available at all due to ruggedness
        continue game;
      }
      if(state.stage == 667) { // Unexpected error, script is stopping for debugging
        return;
      }
      let startMove = Date.now();
      await(ns.go.passTurn());
      aiTime += (Date.now() - startMove);
      state.stage = 5; // Some opponents might do a suicide even after your passing
    }
  }
}

async function processBase(ns, state, aiTime) {
  if(state.candidate == null) {
    let candidates = findBaseCandidates(ns, state);
    if(candidates.length > 0) {
      cleanUpState(state);
      state.candidate = candidates[0];
    } else {
      if(state.eyes.length == 0) {
        state.stage = 666;
      } else {
        state.stage = 4;
      }
      return false;
    }
  }

  // ns.print(state);
  let candidate = state.candidate;
  state.baseDirection = candidate.direction;
  state.baseStart = candidate.start;
  if(candidate.start + state.baseIndex <= candidate.end) {
    let point = {};
    let priorityDirection = (candidate.direction + 2) % 4;
    if(candidate.direction == 0) {
      point.x = candidate.start + state.baseIndex;
      point.y = state.minJ + 1;
    } else if (candidate.direction == 1) {
      point.x = state.minI + 1;
      point.y = candidate.start + state.baseIndex;
    } else if (candidate.direction == 2) {
      point.x = candidate.start + state.baseIndex;
      point.y = state.maxJ - 1;
    } else {
      point.x = state.maxI - 1;
      point.y = candidate.start + state.baseIndex;    
    }
    let cell = state.grid.get(gridKey(point.x, point.y));
    if(cell == '.') {

      if(state.baseIndex == 0 || (candidate.start + state.baseIndex == candidate.end)) {
        let edgePriorityPoint = {};
        edgePriorityPoint.x = point.x;
        edgePriorityPoint.y = point.y;
        if(candidate.direction == 0 || candidate.direction == 2) {
          edgePriorityPoint.direction = (state.baseIndex == 0) ? 1 : 3;
        } else {
          edgePriorityPoint.direction = (state.baseIndex == 0) ? 0 : 2;    
        }
        edgePriorityPoint.baseMult = 1;
        state.primaryStack.push(edgePriorityPoint);
      }

      let priorityPoint = {};
      priorityPoint.x = point.x;
      priorityPoint.y = point.y;
      priorityPoint.direction = priorityDirection;
      priorityPoint.baseMult = baseMult(point.x, point.y, priorityDirection, candidate.direction, state);
      state.primaryStack.push(priorityPoint);

      state.baseIndex++;
      let startMove = Date.now();
      await(ns.go.makeMove(point.x, point.y));
      aiTime += (Date.now() - startMove);
      return true;
    } else {
      if(state.baseIndex >= 5) {
        state.baseEnd = state.baseStart + state.baseIndex - 1;
        createBasePoints(state, candidate.start, state.baseEnd, candidate.direction);
        state.stage = 2;
        state.substage = 0;

        return false;
      }

      moveToNextCandidate(state);
    }
    return true;
  }

  state.baseEnd = candidate.end;
  createBasePoints(state, candidate.start, candidate.end, candidate.direction);
  state.stage = 2;
  state.substage = 0;

  return false;
}

async function processColumns(ns, state, aiTime) {
  if(state.substage == 0) { // Start base column
    let checkPoint = getColumnCheckPoint(state, state.baseStart - 1);
    let columnDirection = (state.baseDirection == 0 || state.baseDirection == 2) ? 1 : 0;
    if(isPartOfGrid(state, checkPoint)) {
      let columnPoint = findColumnPoint(state, true);
      
      if(columnPoint != null) {
        let priorityPoint = {};
        priorityPoint.x = columnPoint.x;
        priorityPoint.y = columnPoint.y;
        priorityPoint.direction = columnDirection;
        priorityPoint.baseMult = baseMult(columnPoint.x, columnPoint.y, columnDirection, state.baseDirection, state);
        state.primaryStack.push(priorityPoint);
        state.substage = 1;

        try {
          let startMove = Date.now();
          await(ns.go.makeMove(columnPoint.x, columnPoint.y));
          aiTime += (Date.now() - startMove);
        } catch(e) {
          moveToNextCandidate(state);
        }
        return true;
      } else {
        moveToNextCandidate(state);
        return true;
      }
    }
    state.substage = 1;
  }

  if(state.substage == 1) { // End base column
    let checkPoint = getColumnCheckPoint(state, state.baseEnd + 1);
    let columnDirection = (state.baseDirection == 0 || state.baseDirection == 2) ? 3 : 2;
    if(isPartOfGrid(state, checkPoint)) {
      let columnPoint = findColumnPoint(state, false);

      if(columnPoint != null) {
        let priorityPoint = {};
        priorityPoint.x = columnPoint.x;
        priorityPoint.y = columnPoint.y;
        priorityPoint.direction = columnDirection;
        priorityPoint.baseMult = baseMult(columnPoint.x, columnPoint.y, columnDirection, state.baseDirection, state);
        state.primaryStack.push(priorityPoint);
        state.substage = 2;

        try {
          let startMove = Date.now();
          await(ns.go.makeMove(columnPoint.x, columnPoint.y));
          aiTime += (Date.now() - startMove);
        } catch(e) {
          moveToNextCandidate(state);
        }
        return true;
      } else {
        moveToNextCandidate(state);
        return true;
      }
    }
    state.substage = 2;
  }      

  if(state.substage == 2) { // Middle column
    let counter = 0;
    for(let point of state.basePoints) {
      if(state.grid.get(gridKey(point.x, point.y)) == '.') {
        counter++; 
      }
    }
    if(counter < 3) {
      moveToNextCandidate(state);
      return true;
    }

    counter = 0;
    let i = 0;
    for(let point of state.basePoints) {
      if(state.grid.get(gridKey(point.x, point.y)) == '.') {
        counter++;
        if(counter == 2) {
          state.stage = 3;
          let eye = {};
          let firstEye = [];
          for(let j = 0; j < i; ++j) {
            firstEye.push(state.basePoints[j]);
          }
          let secondEye = [];
          for(let j = i + 1; j < state.basePoints.length; ++j) {
            secondEye.push(state.basePoints[j]);
          }
          eye.firstEye = firstEye;
          eye.secondEye = secondEye;
          state.eyes.push(eye)
          state.candidate = null;
          let startMove = Date.now();
          await(ns.go.makeMove(point.x, point.y));
          aiTime += (Date.now() - startMove);
          return true;
        }
      }
      i++;
    }
  }
  return false;
}

function getColumnCheckPoint(state, baseValue) {
  let checkPoint = {};
  if(state.baseDirection == 0) {
    checkPoint.x = baseValue;
    checkPoint.y = state.minJ;
  } else if (state.baseDirection == 1) {
    checkPoint.x = state.minI;
    checkPoint.y = baseValue;
  } else if (state.baseDirection == 2) {
    checkPoint.x = baseValue;
    checkPoint.y = state.maxJ;
  } else {
    checkPoint.x = state.maxI;
    checkPoint.y = baseValue;       
  }
  return checkPoint;
}

function findColumnPoint(state, isStart) {
  let columnPoint = null;
  while(state.basePoints.length > 0) {
    let columnCheckPoint = isStart ? state.basePoints.shift() : state.basePoints.pop();
    let columnCell = state.grid.get(gridKey(columnCheckPoint.x, columnCheckPoint.y));
    if(columnCell == '.') {
      columnPoint = columnCheckPoint;
      break;
    }
  }
  return columnPoint;
}

function moveToNextCandidate(state) {
  state.candidate = null;
  state.stage = 1;
  state.baseIndex = 0;
  state.primaryStack = [];
}

function isPartOfGrid(state, point) {
  return state.grid.has(gridKey(point.x, point.y)) && 
      (state.grid.get(gridKey(point.x, point.y)) == 'O' ||
      state.grid.get(gridKey(point.x, point.y)) == '.' ||
      state.grid.get(gridKey(point.x, point.y)) == 'X')
}

async function processExpansion(ns, state, aiTime) {
  state.stage3Counter = 0;
  while(state.nextStraightPoint != null || state.primaryStack.length > 0) {
    state.stage3Counter++;
    if(state.stage3Counter > 1000) {
      await(ns.prompt("Infinite cycle at expansion"));
      state.stage = 667;
      return true;
    }
    if(state.nextStraightPoint != null) {
      let nextPoint = getNextPoint(state.nextStraightPoint, state.nextStraightPoint.direction);
      let direction = state.nextStraightPoint.direction;
      if(state.grid.has(gridKey(nextPoint.x, nextPoint.y)) 
        && state.grid.get(gridKey(nextPoint.x, nextPoint.y)) == '.') {

        generateNewPoints(state, nextPoint, direction);

        let startMove = Date.now();
        await(ns.go.makeMove(nextPoint.x, nextPoint.y));
        aiTime += (Date.now() - startMove);
        return true;
      } else {
        state.nextStraightPoint = null;
      }
    }

    if(state.primaryStack.length > 0) {
      for(let point of state.primaryStack) {
        let counter = calculateCounterMult(state, point);
        let crowdMult = calculateCrowdMult(state, point);   
        point.counter = counter;
        point.crowdMult = crowdMult;
        point.rate = point.baseMult * counter * crowdMult;
      }

      state.primaryStack.sort((a, b) => a.rate - b.rate);        

      let point = state.primaryStack.pop();
      let nextPoint = getNextPoint(point, point.direction);
      if(state.grid.has(gridKey(nextPoint.x, nextPoint.y)) 
        && state.grid.get(gridKey(nextPoint.x, nextPoint.y)) == '.') {

        generateNewPoints(state, nextPoint, point.direction);

        let startMove = Date.now();
        await(ns.go.makeMove(nextPoint.x, nextPoint.y));
        aiTime += (Date.now() - startMove);
        return true;
      }
    }
  }
  moveToNextCandidate(state);
  return true;
}

function copyPoint(point) {
  let newPoint = {};
  newPoint.x = point.x;
  newPoint.y = point.y;
  return newPoint;
}

function generateNewPoints(state, nextPoint, direction) {
  let straightNewPoint = copyPoint(nextPoint);
  straightNewPoint.direction = direction;
  state.nextStraightPoint = straightNewPoint;

  let rightNewPoint = copyPoint(nextPoint);
  rightNewPoint.direction = (direction + 1) % 4;
  rightNewPoint.baseMult = baseMult(nextPoint.x, nextPoint.y, 
    rightNewPoint.direction, state.baseDirection, state);

  let leftNewPoint = copyPoint(nextPoint);
  leftNewPoint.direction = (direction + 3) % 4;
  leftNewPoint.baseMult = baseMult(nextPoint.x, nextPoint.y, 
    leftNewPoint.direction, state.baseDirection, state);

  state.primaryStack.push(rightNewPoint, leftNewPoint); 
}

function calculateCounterMult(state, point) {
  let counter = 0;
  let nextCountPoint = getNextPoint(point, point.direction);
  while(state.grid.has(gridKey(nextCountPoint.x, nextCountPoint.y)) 
    && state.grid.get(gridKey(nextCountPoint.x, nextCountPoint.y)) == '.') {
    counter++;
    if(counter >= 13) {
      break
    }
    nextCountPoint = getNextPoint(nextCountPoint, point.direction);
  }
  return counter;
}

function calculateCrowdMult(state, point) {
  let crowdMult = 1;
  let nextCrowdPoint = getNextPoint(point, point.direction);
  let leftCrowdPoint = getNextPoint(nextCrowdPoint, (point.direction + 3) % 4);
  let rightCrowdPoint = getNextPoint(nextCrowdPoint, (point.direction + 1) % 4);
  if(state.grid.has(gridKey(leftCrowdPoint.x, leftCrowdPoint.y)) 
    && state.grid.get(gridKey(leftCrowdPoint.x, leftCrowdPoint.y)) == 'X') {
    crowdMult = crowdMult * 0.5;
  }
  if(state.grid.has(gridKey(rightCrowdPoint.x, rightCrowdPoint.y)) 
    && state.grid.get(gridKey(rightCrowdPoint.x, rightCrowdPoint.y)) == 'X') {
    crowdMult = crowdMult * 0.5;
  }
  return crowdMult;  
}

async function processBaseCleanup(ns, state, aiTime) {
  state.stage4Counter = 0;
  for(let eye of state.eyes) {
    let firstEye = eye.firstEye;
    let secondEye = eye.secondEye;
    while(firstEye.length > 1 || secondEye.length > 1) {
      state.stage4Counter++;
      if(state.stage4Counter > 1000) {
        await(ns.prompt("Infinite cycle at base clean-up"));
        state.stage = 667;
        return true;
      }

      if(firstEye.length > 1) {
        for(let i = 0; i < firstEye.length; ++i) {
          let point = firstEye[i];
          if(state.grid.get(gridKey(point.x, point.y)) == '.') {
            firstEye.splice(i, 1);
            let startMove = Date.now();
            await(ns.go.makeMove(point.x, point.y));
            aiTime += (Date.now() - startMove);
            return true;
          }
        }
      }

      if(secondEye.length > 1) {
        for(let i = 0; i < secondEye.length; ++i) {
          let point = secondEye[i];
          if(state.grid.get(gridKey(point.x, point.y)) == '.') {
            secondEye.splice(i, 1);
            let startMove = Date.now();
            await(ns.go.makeMove(point.x, point.y));
            aiTime += (Date.now() - startMove);        
            return true;
          }
        }
      }

    }
    if(firstEye.length != 0 && secondEye.length != 0) {
      let eyePoint = {};
      eyePoint.firstEyePoint = firstEye[0];
      eyePoint.secondEyePoint = secondEye[0];
      state.eyePoints.push(eyePoint);
    } else {
      ns.print("Invalid eye built");
      state.stage = 667;
      return true;
    }
  }

  state.stage = 5;
  return true;
}

async function processFill(ns, state, aiTime) {
  state.fillCounter = 0;
  while(true) {
    ++state.fillCounter;
    if(state.fillCounter > 1000) {
      await(ns.prompt("Infinite cycle at carpet bombing"));
      state.stage = 667;
      return true;
    }
    let allEyePoints = [];
    for(let eyePoint of state.eyePoints) {
      allEyePoints.push(eyePoint.firstEyePoint);
      allEyePoints.push(eyePoint.secondEyePoint);
    }
    for(let i = state.minI; i <= state.maxI; ++i) {
      for(let j = state.minJ; j <= state.maxJ; ++j) {
        let isEye = false;
        for(let eyePoint of allEyePoints) {
          if(eyePoint.x == i && eyePoint.y == j) {
            isEye = true;
            break;
          }
        }

        if(isEye) {
            continue;
        }

        if(state.grid.get(gridKey(i, j)) == '.') {
          try {
            let startMove = Date.now();
            await(ns.go.makeMove(i, j));
            aiTime += (Date.now() - startMove);
            return true;
          } catch (e) {

          }
        }
      }
    }
    state.stage = 6;
    break;
  }
  return false;
}

function getNextPoint(point, direction) {
  let tempPoint = {};
  if(direction == 0) {
    tempPoint.x = point.x;
    tempPoint.y = point.y - 1;
  } else if (direction == 1) {
    tempPoint.x = point.x - 1;
    tempPoint.y = point.y;
  } else if (direction == 2) {
    tempPoint.x = point.x;
    tempPoint.y = point.y + 1;
  } else {
    tempPoint.x = point.x + 1;
    tempPoint.y = point.y;       
  }
  return tempPoint;
}

function createBasePoints(state, start, end, direction) {
  let basePoints = [];
  for(let i = start; i <= end; ++i) {
    let point = {};
    if(direction == 0) {
      point.x = i;
      point.y = state.minJ;
    } else if (direction == 1) {
      point.x = state.minI;
      point.y = i;
    } else if (direction == 2) {
      point.x = i;
      point.y = state.maxJ;
    } else {
      point.x = state.maxI;
      point.y = i;      
    }
    basePoints.push(point);
  }
  state.basePoints = basePoints;
}

function parseGrid(boardState, state) {
  const grid = new Map();
  let maxI = -1;
  let maxJ = -1;
  let minI = 13;
  let minJ = 13;

  for(let i = 0; i < boardState.length; ++i) {
    let row = boardState[i];
    for (let j = 0; j < row.length; j++) {
      let char = row.charAt(j);
      grid.set(gridKey(i, j), char);
      if(char == '.') {
        if(i > maxI) {
          maxI = i;
        }
        if(j > maxJ) {
          maxJ = j;
        }
        if(i < minI) {
          minI = i;
        }
        if(j < minJ) {
          minJ = j;
        }
      }
    }
  }
  state.grid = grid;
  state.maxI = maxI;
  state.maxJ = maxJ;
  state.minI = minI;
  state.minJ = minJ;
}

function findBaseCandidates(ns, state) {
  let candidates = [];
  for(let k = 0; k < 4; ++k) {
    let streak = false;
    let streakStart;
    let minCount = (k == 0 || k == 2) ? state.minI : state.minJ;
    let maxCount = (k == 0 || k == 2) ? state.maxI : state.maxJ;
    for(let i = minCount; i <= maxCount; ++i) {
      let cell0;
      let cell1;
      if(k == 0) {
        cell0 = state.grid.get(gridKey(i, state.minJ));
        cell1 = state.grid.get(gridKey(i, state.minJ + 1));
      } else if (k == 1) {
        cell0 = state.grid.get(gridKey(state.minI, i));
        cell1 = state.grid.get(gridKey(state.minI + 1, i));
      } else if (k == 2) {
        cell0 = state.grid.get(gridKey(i, state.maxJ));
        cell1 = state.grid.get(gridKey(i, state.maxJ - 1));
      } else {
        cell0 = state.grid.get(gridKey(state.maxI, i));
        cell1 = state.grid.get(gridKey(state.maxI - 1, i));
      }
      if(streak) {
        if(cell0 != '.' || cell1 != '.') {
          streak = false;
          let streakLength = i - streakStart;
          if(streakLength >= 4) {
            candidates.push(createCandidate(k, streakStart, i - 1));
          }
        }
      } else {
        if(cell0 == '.' && cell1 == '.') {
          streak = true;
          streakStart = i;
        }
      }
    }
    if(streak) {
      let streakLength = maxCount - streakStart;
      if(streakLength >= 5) {
        candidates.push(createCandidate(k, streakStart, maxCount));
      }
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates;
}

function createCandidate(direction, start, end) {
  let candidate = {};
  candidate.length = end + 1 - start;
  candidate.direction = direction;
  candidate.start = start;
  candidate.end = end;
  return candidate;
}

function gridKey(i, j) {
  return i + "_" + j;
}

function cleanUpState(state) {
  state.stage = 1;
  state.candidate = null;
  state.baseIndex = 0;
  state.primaryStack = [];
  state.nextStraightPoint = null;
}

function baseMult(x, y, direction, baseDirection, state) {
  if(direction == 0 || direction == 2) {
    if(baseDirection == 0 || baseDirection == 2) {
      if(x == state.minI || x == state.maxI) {
        return 1;
      }
      if(x == state.minI + 1 || x == state.maxI - 1) {
        return 1.5;
      }
      return 2;
    }
    if(baseDirection == 1) {
      if(x <= state.minI + 2 || x == state.maxI) {
        return 1;
      }
      if(x == state.minI + 3 || x == state.maxI - 1) {
        return 1.5;
      }
      return 2;
    }
    if(baseDirection == 3) {
      if(x == state.minI || x >= state.maxI - 2) {
        return 1;
      }
      if(x == state.minI + 1 || x == state.maxI - 3) {
        return 1.5;
      }
      return 2;
    }
  }

  if(direction == 1 || direction == 3) {
    if(baseDirection == 1 || baseDirection == 3) {
      if(y == state.minJ || y == state.maxJ) {
        return 1;
      }
      if(y == state.minJ + 1 || y == state.maxJ - 1) {
        return 1.5;
      }
      return 2;
    }
    if(baseDirection == 0) {
      if(y <= state.minJ + 2 || y == state.maxJ) {
        return 1;
      }
      if(y == state.minJ + 3 || y == state.maxJ - 1) {
        return 1.5;
      }
      return 2;
    }
    if(baseDirection == 2) {
      if(y == state.minJ || y >= state.maxJ - 2) {
        return 1;
      }
      if(y == state.minJ + 1 || y == state.maxJ - 3) {
        return 1.5;
      }
      return 2;
    }
  }

}
