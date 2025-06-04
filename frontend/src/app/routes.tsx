import { NotFound } from '@app/components/NotFound/NotFound';
import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Buckets from './components/Buckets/Buckets';
import ObjectBrowser from './components/ObjectBrowser/ObjectBrowser';
import SettingsManagement from './components/Settings/Settings';
import VramEstimator from './components/VramEstimator/VramEstimator';


let routeFocusTimer: number;

export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  element: JSX.Element;
  path: string;
  title: string;
  routes?: undefined;
  bottomRoutes?: undefined;
  disabled?: boolean;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
  isExpanded?: boolean;
}

export type AppRouteConfig = IAppRoute | IAppRouteGroup;


const routes: AppRouteConfig[] = [
  {
    label: 'S3 Tools',
    isExpanded: true,
    routes: [
      {
        element: <ObjectBrowser />,
        label: 'Object Browser',
        path: '/objects/:bucketName/:prefix?',
        title: 'Object Browser',
      },
      {
        element: <Buckets />,
        label: 'Bucket Management',
        path: '/buckets',
        title: 'Bucket Management',
      },
    ],
  },
  {
    label: 'GPU Tools',
    isExpanded: true,
    routes: [
      {
        element: <VramEstimator />,
        label: 'VRAM Estimator',
        path: '/gpu/vram-estimator',
        title: 'VRAM Estimator',
      },
    ],
  },
  {
    element: <Navigate to="/objects/:bucketName/:prefix?" />,
    path: '/',
    title: 'Redirect',
  },
  {
    element: <SettingsManagement />,
    label: 'Settings',
    path: '/settings',
    title: 'Settings',
  },
  {
    element: <Navigate to="/objects/:bucketName/:prefix?" />,
    path: '*',
    title: 'Redirect',
  },
];


// a custom hook for sending focus to the primary content container
// after a view has loaded so that subsequent press of tab key
// sends focus directly to relevant content
// may not be necessary if https://github.com/ReactTraining/react-router/issues/5210 is resolved
const useA11yRouteChange = () => {
  const { pathname } = useLocation();
  React.useEffect(() => {
    routeFocusTimer = window.setTimeout(() => {
      const mainContainer = document.getElementById('primary-app-container');
      if (mainContainer) {
        mainContainer.focus();
      }
    }, 50);
    return () => {
      window.clearTimeout(routeFocusTimer);
    };
  }, [pathname]);
};

const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])],
  [] as IAppRoute[]
);

const AppRoutes = (): React.ReactElement => (
  <Routes>
    {flattenedRoutes.map((route, idx) => (
      <Route path={route.path} element={route.element} key={idx} />
    ))}
    <Route element={<NotFound/>} />
  </Routes>
);

export { AppRoutes, routes };
