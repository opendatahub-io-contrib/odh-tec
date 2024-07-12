import { NotFound } from '@app/components/NotFound/NotFound';
import { useDocumentTitle } from '@app/utils/useDocumentTitle';
import * as React from 'react';
import { Redirect, Route, RouteComponentProps, Switch, useLocation } from 'react-router-dom';
import Buckets from './components/Buckets/Buckets';
import ObjectBrowser from './components/ObjectBrowser/ObjectBrowser';
import SettingsManagement from './components/Settings/Settings';


let routeFocusTimer: number;
export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  /* eslint-disable @typescript-eslint/no-explicit-any */
  component: React.ComponentType<RouteComponentProps<any>> | React.ComponentType<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  exact?: boolean;
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
        component: ObjectBrowser,
        exact: true,
        label: 'Object Browser',
        path: '/objects/:bucketName/:prefix?',
        title: 'Object Browser',
      },
      {
        component: Buckets,
        exact: true,
        label: 'Bucket Management',
        path: '/buckets',
        title: 'Bucket Management',
      },
    ],
  },
  {
    component: () => <Redirect to="/objects/:bucketName/:prefix?" />,
    exact: true,
    path: '/',
    title: 'Redirect',
  },
  {
    component: SettingsManagement,
    exact: true,
    label: 'Settings',
    path: '/settings',
    title: 'Settings',
  },
  {
    component: () => <Redirect to="/objects/:bucketName/:prefix?" />,
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

const RouteWithTitleUpdates = ({ component: Component, title, ...rest }: IAppRoute) => {
  useA11yRouteChange();
  useDocumentTitle(title);

  function routeWithTitle(routeProps: RouteComponentProps) {
    return <Component {...rest} {...routeProps} />;
  }

  return <Route render={routeWithTitle} {...rest} />;
};

const PageNotFound = ({ title }: { title: string }) => {
  useDocumentTitle(title);
  return <Route component={NotFound} />;
};

const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])],
  [] as IAppRoute[]
);

const AppRoutes = (): React.ReactElement => (
  <Switch>
    {flattenedRoutes.map(({ path, exact, component, title }, idx) => (
      <RouteWithTitleUpdates path={path} exact={exact} component={component} key={idx} title={title} />
    ))}
    <PageNotFound title="404 Page Not Found" />
  </Switch>
);

export { AppRoutes, routes };
