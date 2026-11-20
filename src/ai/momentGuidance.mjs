// Both the service and the local teacher review use the same Korean response options.
// Only the observation for this instant is considered. A session-wide tag cannot
// identify who performed an action in a particular frame.
const waitForStack = {
  id: 'stack-turn', decision: 'WAIT',
  action: '아이가 직접 블록을 쌓고 있다면 손을 떼고 다음 블록을 어디에 놓을지 기다려 주세요.',
  watchFor: '다음 블록을 집는지, 블록을 어른에게 건네며 도움을 청하는지 살펴보세요.',
};
const waitForBlock = {
  id: 'block-turn', decision: 'WAIT',
  action: '아이가 블록을 옮기는 중이면 놓을 자리를 비워 두고 스스로 마칠 시간을 주세요.',
  watchFor: '블록을 내려놓고 다시 집는지, 어른 쪽으로 내미는지 살펴보세요.',
};
const checkBlocks = {
  id: 'block-context', decision: 'CHECK',
  action: '블록의 위치만 보인다면 손을 보태기 전에 누가 블록을 옮기고 있는지 확인해 주세요.',
  watchFor: '아이가 다음 블록에 손을 뻗는지, 누군가에게 블록을 건네는지 살펴보세요.',
};
const watchBlocks = {
  id: 'watch-block-choice', decision: 'CHECK',
  action: '블록을 바라보는 사람이 누구인지 확인해 주세요. 아이가 보고 있다면 먼저 블록을 건네기보다 어느 쪽으로 손을 뻗는지 기다려 주세요.',
  watchFor: '아이의 손이 향하는 블록과 어른이 먼저 집는 블록을 구분해 보세요.',
};
const checkStackTurn = {
  id: 'check-stack-turn', decision: 'WAIT',
  action: '블록을 올려놓는 손이 누구의 손인지 보세요. 아이가 쌓는 중이라면 다음 블록을 대신 올리지 말고 자리를 비워 주세요.',
  watchFor: '아이가 다음 블록을 집는지, 블록을 어른에게 내밀어 도움을 청하는지 보세요.',
};
const checkBlockPick = {
  id: 'check-block-pick', decision: 'WAIT',
  action: '블록을 집는 손을 확인해 주세요. 아이가 집고 있다면 손에서 받아 가지 말고 어디에 놓으려는지 기다려 주세요.',
  watchFor: '아이가 블록을 쥐고 이동하는지, 어른에게 보여 주거나 건네는지 살펴보세요.',
};
const afterAdultTurn = {
  id: 'after-adult-turn', decision: 'WAIT',
  action: '블록을 놓는 손이 실제로 어른의 손이라면, 블록을 놓은 뒤 잠시 멈추고 아이가 하나를 직접 고를 자리를 남겨 주세요.',
  watchFor: '아이가 어느 블록에 손을 뻗는지, 다른 곳으로 관심을 옮기는지 살펴보세요.',
};
const afterAdultStack = {
  id: 'after-adult-stack', decision: 'WAIT',
  action: '쌓는 손이 실제로 어른의 손인지 확인해 주세요. 어른이 한 번 올려놓은 뒤에는 손을 거두고 아이가 다음 블록을 놓을 공간을 남겨 주세요.',
  watchFor: '아이가 탑 위에 올리려는지, 다른 곳에 블록을 놓으려는지 살펴보세요.',
};
const afterAdultPick = {
  id: 'after-adult-pick', decision: 'WAIT',
  action: '블록을 집은 사람이 실제로 어른이라면, 곧바로 아이 손에 쥐여 주지 말고 아이가 그 블록에 손을 뻗는지 기다려 주세요.',
  watchFor: '집어 든 블록과 바닥에 남은 블록 중 아이의 손이 어느 쪽으로 향하는지 보세요.',
};
const adultOffersBlock = {
  id: 'adult-offers-block', decision: 'OFFER',
  action: '어른이 아이에게 블록을 내미는 장면이 맞다면, 아이 손 옆에서 잠시 멈추고 스스로 받을지 고르게 해 주세요.',
  watchFor: '아이가 손을 내밀어 받는지, 손을 거두거나 다른 블록을 고르는지 살펴보세요.',
};
export const contextGuidance = {
  id: 'check-context', decision: 'CHECK',
  action: '곁에서 아이가 하던 일을 계속하는지, 도움을 청하는 손짓이 있는지 먼저 확인해 주세요.',
  watchFor: '아이의 다음 행동과 그 직전에 주변에서 있었던 일을 함께 살펴보세요.',
};
const checkSpace = {
  id: 'check-space', decision: 'CHECK',
  action: '가까이에 부딪힐 사람이나 물건이 있는지 바로 살펴보고, 닿을 상황이면 공간을 확보해 주세요.',
  watchFor: '물건이나 손이 어느 쪽으로 움직이고 주변 사람과 얼마나 가까운지 확인해 주세요.',
};
const makeSpace = {
  id: 'protect-person', decision: 'SAFETY',
  action: '현장에서 이런 모습이 보이면 먼저 맞을 수 있는 사람을 손이나 물건이 향하는 자리에서 벗어나게 하고, 서로 거리를 두게 해 주세요.',
  watchFor: '자리를 확보한 뒤 손이나 물건이 다시 사람 쪽으로 향하는지 확인해 주세요.',
};
const pauseOffering = {
  id: 'pause-offer', decision: 'WAIT',
  action: '건넨 물건을 아이가 밀어낸 상황이라면 다시 내밀지 말고 아이가 다음에 무엇을 고르는지 기다려 주세요.',
  watchFor: '물건을 다시 가져가는지, 다른 곳으로 손을 뻗는지 살펴보세요.',
};
const offerComfort = {
  id: 'offer-comfort', decision: 'OFFER',
  action: '아이 곁에서 “여기 있어”라고 짧게 말하고, 다가올지 잠깐 거리를 둘지 아이의 반응을 기다려 주세요.',
  watchFor: '아이가 어른 쪽으로 가까이 오는지, 몸을 돌리는지 살펴보세요.',
};
const followPoint = {
  id: 'follow-point', decision: 'OFFER',
  action: '아이가 가리킨 쪽을 함께 보고 “이거?”라고 한 번 물어본 뒤 답할 시간을 주세요.',
  watchFor: '아이가 같은 곳을 다시 가리키는지, 다른 쪽을 가리키는지 살펴보세요.',
};
const receiveObject = {
  id: 'receive-object', decision: 'OFFER',
  action: '아이가 어른에게 물건을 내밀면 손바닥을 펴고 기다려 주세요. 아이가 놓는 만큼만 받아 주세요.',
  watchFor: '물건을 손에 놓는지, 보여 준 뒤 다시 가져가는지 살펴보세요.',
};
const offerHelp = {
  id: 'offer-help', decision: 'OFFER',
  action: '“조금 도와줄까?”라고 한 번 묻고 기다려 주세요. 아이가 받아들이면 막힌 부분 하나만 함께해 보세요.',
  watchFor: '아이의 손이 어른 쪽으로 오는지, 스스로 다시 시도하는지 살펴보세요.',
};
const waitForPage = {
  id: 'page-turn', decision: 'WAIT',
  action: '아이가 책장을 넘기는 중이면 다음 쪽으로 이끌지 말고 아이가 펼친 쪽을 그대로 두세요.',
  watchFor: '한 쪽에 머무는지, 다음 장을 넘기는지, 그림을 가리키는지 살펴보세요.',
};
const waitForObject = {
  id: 'object-turn', decision: 'WAIT',
  action: '아이가 물건을 스스로 들어 올리면 손으로 이끌지 말고 어디에 놓으려는지 잠시 기다려 주세요.',
  watchFor: '물건을 내려놓는지, 계속 들고 있는지, 어른에게 내미는지 살펴보세요.',
};
const noticeObject = {
  id: 'notice-object', decision: 'WAIT',
  action: '아이가 들고 있는 물건을 함께 봐 주세요. 어른 쪽으로 내밀면 손을 펴고, 계속 쥐고 있으면 그대로 둘 시간을 주세요.',
  watchFor: '물건을 잠시 보여 주는지, 어른 손에 놓는지 살펴보세요.',
};
const checkOverhead = {
  id: 'overhead-space', decision: 'CHECK',
  action: '머리 위로 든 물건이 무겁거나 얼굴에 닿을 위치인지 먼저 확인해 주세요. 닿을 것 같으면 곁에서 내려놓을 자리를 마련해 주세요.',
  watchFor: '아이가 물건을 어느 쪽으로 옮기는지, 가까이에 다른 사람이 있는지 살펴보세요.',
};

const uncertain = /않|아니|아닌|안\s*(?:쌓|놓|건네|받|울|도와|넘기|밀|가리|던|때리)|없|모르|불분명|어렵|흐릿|추정|듯|것 같|인지|못|가려져|보이지|뻔|려는|려고|려다가|대신|흉내|척(?:해|하)|만약|다면/;
const adultActor = /(?:어른|성인|보호자|양육자|교사|선생님|엄마|아빠|할머니|할아버지|부모|여성|남성|여자|남자)(?:들)?(?:이|가|은|는|의\s*손)/;
const personActor = /사람(?:들)?(?:이|은|의\s*손)/;
const childActor = /(?:아이|아동|어린이|유아)(?:들)?(?:가|는|이|은)/;
const block = /블록|블럭|쌓기나무/;
// Look for the action at the end. A block already lying on the floor can be
// mentioned as a landmark while someone picks up a different block.
const activeEnding = '(?:아요|어요|요|습니다|니다|었어요|았어요|고 있어요|고 있습니다|는 모습이에요)[.!]?\\s*$';
const stacking = new RegExp('(?:쌓(?:아\\s*(?:올려|올리|올립))?|쌓아|쌓았|포개(?:\\s*놓)?|겹쳐(?:\\s*놓)?|위[에로].{0,22}(?:올려\\s*놓|올려|올리|올립|얹|놓))' + activeEnding);
const pickingBlock = new RegExp('(?:집|집어 들|집어 올리)' + activeEnding);
const movingBlock = new RegExp('(?:집|집어 들|옮기|옮겨|옮깁|끌|놓|들어\\s*올리|들|내려놓)' + activeEnding);
const watchingBlock = /바라(?:봐요|보고 있어요|봅니다)|쳐다(?:봐요|보고 있어요)/;
const targetPerson = '(?:친구|아이|어린이|어른|사람|선생님|교사|보호자|엄마|아빠)';
const thrownToward = targetPerson + '(?:에게(?!서)|한테(?!서)|\\s*쪽으로|(?:를|을)\\s*향해|(?:의\\s*|\\s*)(?:얼굴|몸)(?:로|으로|을\\s*향해|\\s*쪽으로))';
const hardObject = '(?:돌멩이|돌덩이|망치|유리병|(?:단단한|딱딱한|나무|금속|쇠|무거운)\\s*(?:공|블록|블럭|조각|상자|물건|책|장난감))(?:을|를)';
const directedThrow = new RegExp('(?:' + thrownToward + '\\s*' + hardObject + '|' + hardObject
  + '\\s*(?:(?:주워|들고)\\s*)?(?:(?:다른|옆|옆에 있는)\\s*)?' + thrownToward + ')\\s*(?:(?:세게|힘껏|갑자기)\\s*)?'
  + '던(?:져요|져서|졌|지고|지는|지며|집니다)');
const hitPerson = new RegExp(targetPerson
  + '(?:(?:을|를)|(?:의\\s*|\\s*)(?:팔|손|등|얼굴|머리|몸)(?:을|를))\\s*(?:(?:손|주먹|발|[가-힣]+블록)(?:으로|로)\\s*)?'
  + '(?:때(?:려요|렸|리는|리고|리며|립니다)|쳐요|쳤어요|치고 있어|칩니다)');
const offerRelative = /(?:어른|선생님|보호자|엄마|아빠)(?:이|가)\s*(?:건넨|내민|준)\s*/g;

function directlyEndangersPerson(note) {
  return hitPerson.test(note) || directedThrow.test(note);
}

function blockOptions(note, isAdult, isUnidentified) {
  const stacked = stacking.test(note);
  if (isAdult && /(?:아이|어린이)(?:에게|한테|\s*쪽으로).{0,25}(?:건네|내밀|내미)/.test(note)) return [adultOffersBlock];
  if (stacked || movingBlock.test(note)) {
    if (isAdult) {
      if (stacked) return [afterAdultStack, checkStackTurn];
      if (pickingBlock.test(note)) return [afterAdultPick, checkBlockPick];
      return [afterAdultTurn];
    }
    if (isUnidentified) return stacked ? [checkStackTurn, waitForStack] : [checkBlockPick, waitForBlock];
    return stacked ? [waitForStack, waitForBlock] : [waitForBlock];
  }
  return watchingBlock.test(note) ? [watchBlocks] : [checkBlocks];
}

/** Evidence-compatible options, with the default first. Nothing here is an observation. */
export function guidanceOptionsFor(note) {
  if (typeof note !== 'string' || !note.trim() || uncertain.test(note)) return [contextGuidance];
  if (directlyEndangersPerson(note)) return [makeSpace];
  if (/던지|던져|던졌|때리|때려|부딪|부딫|휘둘|휘두르|집어던/.test(note)) return [checkSpace];
  const isAdult = adultActor.test(note.replace(offerRelative, ''));
  const isUnidentified = personActor.test(note);
  if (isAdult || isUnidentified) {
    return block.test(note) ? blockOptions(note, isAdult, isUnidentified) : [contextGuidance];
  }
  if (childActor.test(note)) {
    if (/울고|울어요|울음을|눈물을 흘/.test(note)) return [offerComfort];
    if (/도움을 (?:청|요청|구)|도와 달|도와달/.test(note)) return [offerHelp];
    if (/가리키|가리켜|가리켰|손가락질/.test(note)) return [followPoint];
    if (/(?:어른|선생님|보호자|엄마|아빠)(?:에게|한테|\s*쪽으로).{0,30}(?:건네|내밀|내미)/.test(note)) return [receiveObject];
    if (/밀어내|밀어냈|밀어 내|밀쳐/.test(note)) return [pauseOffering];
    if (/(?:책|그림책|페이지|쪽).{0,18}(?:넘기|넘겨|넘깁)/.test(note)) return [waitForPage];
    if (/머리\s*위/.test(note) && /들어\s*올|들고|들어\s*요/.test(note)) return [checkOverhead];
    if (/물건|책|장난감|블록|상자/.test(note) && /들고|들어\s*올|쥐고/.test(note) &&
        /(?:어른|선생님|보호자|엄마|아빠)(?:을|를|\s*쪽을).{0,8}(?:바라|쳐다)/.test(note)) return [noticeObject];
  }
  if (block.test(note)) return blockOptions(note, false, false);
  if (childActor.test(note) && /물건|책|장난감|상자/.test(note) && /들어\s*올/.test(note)) return [waitForObject];
  return [contextGuidance];
}
