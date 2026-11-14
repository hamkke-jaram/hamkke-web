import { Suspense, lazy } from 'react';
import { Loading } from '../../components/ui';

/**
 * 기능별 시연을 필요할 때만 불러온다(앱 첫 화면 크기를 늘리지 않게). DEMO_ENABLED일 때만 그려진다.
 */
const FeatureMenu = lazy(() => import('./FeatureMenu'));
const FeatureHost = lazy(() => import('./FeatureHost'));

export function FeatureMenuRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <FeatureMenu />
    </Suspense>
  );
}

export function FeatureHostLazy() {
  return (
    <Suspense fallback={null}>
      <FeatureHost />
    </Suspense>
  );
}
