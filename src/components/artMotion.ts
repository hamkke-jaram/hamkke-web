import './artMotion.css';

/*
 * 코칭 모찌 그림(.art-motion, coachingArt.ts artMotionFor)이 화면에 보이는 동안만 움직이게 한다.
 * - 보이면 .in-view(움직임 켬)와 .art-enter(한 번 톡 등장)를 달고, 화면 밖으로 나가면 .in-view를 뗀다(멈춤).
 *   가로 캐러셀처럼 넘쳐서 가려진 카드도 화면 밖으로 본다(IntersectionObserver는 조상의 넘침 자르기까지 따진다).
 * - 새로 그려지는 그림도 찾는다(MutationObserver). 앱을 그릴 때 한 번 부른다(App.tsx).
 * '움직이는 캐릭터'가 꺼져 있으면 CSS가 아무것도 움직이지 않으므로 여기서는 따로 보지 않는다.
 */
export function installArtMotion(root: HTMLElement = document.body): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          if (!el.classList.contains('in-view')) el.classList.add('in-view', 'art-enter');
        } else el.classList.remove('in-view', 'art-enter');
      }
    },
    { threshold: 0.35 },
  );
  const watched = new WeakSet<Element>();
  const watch = (el: Element) => {
    if (watched.has(el)) return;
    watched.add(el);
    io.observe(el);
  };
  const scan = (node: Element) => {
    if (node.matches('.art-motion')) watch(node);
    node.querySelectorAll('.art-motion').forEach(watch);
  };
  scan(root);
  const mo = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && scan(n));
  });
  mo.observe(root, { childList: true, subtree: true });
  // 등장이 끝나면 떼어 둔다(다시 들어올 때 또 톡 튀게).
  const onEnd = (e: AnimationEvent) => {
    if (e.animationName === 'art-pop' && e.target instanceof Element) e.target.classList.remove('art-enter');
  };
  document.addEventListener('animationend', onEnd);
  return () => {
    io.disconnect();
    mo.disconnect();
    document.removeEventListener('animationend', onEnd);
  };
}
