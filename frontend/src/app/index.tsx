import * as React from 'react';
import '@patternfly/react-core/dist/styles/base.css';
import { BrowserRouter as Router } from 'react-router-dom';
import { AppLayout } from '@app/components/AppLayout/AppLayout';
import { AppRoutes } from '@app/routes';
import '@app/app.css';
import { UserProvider } from '@app/components/UserContext/UserContext';

const App: React.FunctionComponent = () => (
  <UserProvider>
    <Router>
      <AppLayout>
        <AppRoutes />
      </AppLayout>
    </Router>
  </UserProvider>
);

export default App;
