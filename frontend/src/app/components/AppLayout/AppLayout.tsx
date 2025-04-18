import imgAvatar from '@app/assets/bgimages/default-user.svg';
import logoReverse from '@app/assets/bgimages/odh-logo-dark-theme.svg';
import logoStd from '@app/assets/bgimages/odh-logo-light-theme.svg';
import { useUser } from '@app/components/UserContext/UserContext';
import config from '@app/config';
import { IAppRoute, IAppRouteGroup, routes } from '@app/routes';
import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  AlertProps,
  Avatar,
  Brand,
  Button,
  ButtonVariant,
  Content,
  ContentVariants,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Flex,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  MenuToggle,
  MenuToggleElement,
  Nav,
  NavExpandable,
  NavItem,
  NavList,
  NotificationBadge,
  NotificationBadgeVariant,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerHeader,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemBody,
  NotificationDrawerListItemHeader,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  Popover,
  SkipToContent,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import {
  Modal
} from '@patternfly/react-core/deprecated';
import { BarsIcon, EllipsisVIcon, QuestionCircleIcon, SearchIcon } from '@patternfly/react-icons';
import MoonIcon from '@patternfly/react-icons/dist/esm/icons/moon-icon';
import SunIcon from '@patternfly/react-icons/dist/esm/icons/sun-icon';
import axios from 'axios';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { supportedLngs } from '../../../i18n/config';
import Emitter from '../../utils/emitter';

interface IAppLayout {
  children: React.ReactNode;
}

const AppLayout: React.FunctionComponent<IAppLayout> = ({ children }) => {
  // Theme
  const [isDarkTheme, setIsDarkTheme] = React.useState(false);

  // Language
  const [selectedLanguage, setSelectedLanguage] = React.useState('en');
  const onChangeLanguage = (_event: React.FormEvent<HTMLSelectElement>, language: string) => {
    setSelectedLanguage(language);
  };

  //i18n
  const { t, i18n } = useTranslation();
  React.useEffect(() => {
    i18n.changeLanguage(selectedLanguage);
  }, [selectedLanguage]);

  // User
  const { userName, setUserName } = useUser();

  React.useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        // Get headers from current page
        const response = await fetch(window.location.href, {
          method: 'HEAD',
          credentials: 'same-origin' // Include cookies in the request
        });

        const entries = [...response.headers.entries()];
        const gapAuthHeader = entries.find(entry => entry[0] === 'gap-auth');
        const gapAuthValue = gapAuthHeader ? gapAuthHeader[1] : 'user@domain.com';
        setUserName(gapAuthValue);
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    }
    fetchUserInfo();
  }, []);

  // Notifications
  interface NotificationProps {
    title: string;
    srTitle: string;
    variant: 'custom' | 'success' | 'danger' | 'warning' | 'info';
    key: React.Key;
    timestamp: string;
    description: string;
    isNotificationRead: boolean;
  }

  const maxDisplayedAlerts = 3;
  const minAlerts = 0;
  const maxAlerts = 100;
  const alertTimeout = 8000;

  const [isDrawerExpanded, setDrawerExpanded] = React.useState(false);
  const [openDropdownKey, setOpenDropdownKey] = React.useState<React.Key | null>(null);
  const [overflowMessage, setOverflowMessage] = React.useState<string>('');
  const [maxDisplayed, setMaxDisplayed] = React.useState(maxDisplayedAlerts);
  const [alerts, setAlerts] = React.useState<React.ReactElement<AlertProps>[]>([]);
  const [notifications, setNotifications] = React.useState<NotificationProps[]>([]);

  React.useEffect(() => {

    const handleNotification = (data) => {
      addNewNotification(data.variant, data.title, data.description);
    }

    Emitter.on('notification', handleNotification);

    // Clean up the subscription when the component unmounts
    return () => {
      Emitter.off('notification', handleNotification);
    };
  }, []);

  React.useEffect(() => {
    setOverflowMessage(buildOverflowMessage());
  }, [maxDisplayed, notifications, alerts]);

  const addNewNotification = (variant: NotificationProps['variant'], inputTitle, description) => {
    const key = getUniqueId();
    const timestamp = getTimeCreated();

    // Extract message from description if possible
    let errorDescription: string = '';
    try {
      const errorPrefix = 'OpenAI API error: Error code: ';
      if (typeof description === 'string' && description.startsWith(errorPrefix)) {
        const jsonPart = description.substring(description.indexOf('{'));
        const jsonString = jsonPart // JSON cleaning
          .replace(/'/g, '"')
          .replace(/None/g, 'null')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false');
        const errorObj = JSON.parse(jsonString);
        if (errorObj && errorObj.message) {
          errorDescription = `${errorObj.message}`;
        }
      }
    } catch (e) {
      console.error("Could not parse error description:", e);
    }

    const variantFormatted = variant.charAt(0).toUpperCase() + variant.slice(1);
    let title = '';
    if (inputTitle !== '') {
      title = errorDescription
        ? variantFormatted + ' - ' + inputTitle + ': ' + errorDescription
        : variantFormatted + ' - ' + inputTitle;
    } else {
      title = variantFormatted;
    }
    const srTitle = variantFormatted + ' alert';

    setNotifications((prevNotifications) => [
      { title, srTitle, variant, key, timestamp, description, isNotificationRead: false },
      ...prevNotifications
    ]);

    if (!isDrawerExpanded) {
      setAlerts((prevAlerts) => [
        <Alert
          variant={variant}
          title={title}
          timeout={alertTimeout}
          onTimeout={() => removeAlert(key)}
          isLiveRegion
          actionClose={
            <AlertActionCloseButton title={title} variantLabel={`${variant} alert`} onClose={() => removeAlert(key)} />
          }
          key={key}
          id={key.toString()}
        >
          <p>{description}</p>
        </Alert>,
        ...prevAlerts
      ]);
    }
  };

  const removeNotification = (key: React.Key) => {
    setNotifications((prevNotifications) => prevNotifications.filter((notification) => notification.key !== key));
  };

  const removeAllNotifications = () => {
    setNotifications([]);
  };

  const isNotificationRead = (key: React.Key) =>
    notifications.find((notification) => notification.key === key)?.isNotificationRead;

  const markNotificationRead = (key: React.Key) => {
    setNotifications((prevNotifications) =>
      prevNotifications.map((notification) =>
        notification.key === key ? { ...notification, isNotificationRead: true } : notification
      )
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prevNotifications) =>
      prevNotifications.map((notification) => ({ ...notification, isNotificationRead: true }))
    );
  };

  const getUnreadNotificationsNumber = () =>
    notifications.filter((notification) => notification.isNotificationRead === false).length;

  const containsUnreadAlertNotification = () =>
    notifications.filter(
      (notification) => notification.isNotificationRead === false && notification.variant === 'danger'
    ).length > 0;

  const getNotificationBadgeVariant = () => {
    if (getUnreadNotificationsNumber() === 0) {
      return NotificationBadgeVariant.read;
    }
    if (containsUnreadAlertNotification()) {
      return NotificationBadgeVariant.attention;
    }
    return NotificationBadgeVariant.unread;
  };

  const onNotificationBadgeClick = () => {
    removeAllAlerts();
    setDrawerExpanded(!isDrawerExpanded);
  };

  const onDropdownToggle = (id: React.Key) => {
    if (id && openDropdownKey !== id) {
      setOpenDropdownKey(id);
      return;
    }
    setOpenDropdownKey(null);
  };

  const onDropdownSelect = () => {
    setOpenDropdownKey(null);
  };

  const buildOverflowMessage = () => {
    const overflow = alerts.length - maxDisplayed;
    if (overflow > 0 && maxDisplayed > 0) {
      return `View ${overflow} more notification(s) in notification drawer`;
    }
    return '';
  };

  const getUniqueId = () => uuidv4();

  const getTimeCreated = () => {
    const dateCreated = new Date();
    return (
      dateCreated.toDateString() +
      ' at ' +
      ('00' + dateCreated.getHours().toString()).slice(-2) +
      ':' +
      ('00' + dateCreated.getMinutes().toString()).slice(-2)
    );
  };

  const removeAlert = (key: React.Key) => {
    setAlerts((prevAlerts) => prevAlerts.filter((alert) => alert.props.id !== key.toString()));
  };

  const removeAllAlerts = () => {
    setAlerts([]);
  };

  const onAlertGroupOverflowClick = () => {
    removeAllAlerts();
    setDrawerExpanded(true);
  };

  const onMaxDisplayedAlertsMinus = () => {
    setMaxDisplayed(normalizeAlertsNumber(maxDisplayed - 1));
  };

  const onMaxDisplayedAlertsChange = (event: any) => {
    setMaxDisplayed(normalizeAlertsNumber(Number(event.target.value)));
  };

  const onMaxDisplayedAlertsPlus = () => {
    setMaxDisplayed(normalizeAlertsNumber(maxDisplayed + 1));
  };

  const normalizeAlertsNumber = (value: number) => Math.max(Math.min(value, maxAlerts), minAlerts);

  const alertButtonStyle = { marginRight: '8px', marginTop: '8px' };

  const notificationBadge = (
    <ToolbarItem>
      <NotificationBadge
        variant={getNotificationBadgeVariant()}
        onClick={onNotificationBadgeClick}
        aria-label="Notifications"
      ></NotificationBadge>
    </ToolbarItem>
  );

  const notificationDrawerActions = (
    <>
      <DropdownItem key="markAllRead" onClick={markAllNotificationsRead}>
        Mark all read
      </DropdownItem>
      <DropdownItem key="clearAll" onClick={removeAllNotifications}>
        Clear all
      </DropdownItem>
    </>
  );
  const notificationDrawerDropdownItems = (key: React.Key) => [
    <DropdownItem key={`markRead-${key}`} onClick={() => markNotificationRead(key)}>
      Mark as read
    </DropdownItem>,
    <DropdownItem key={`clear-${key}`} onClick={() => removeNotification(key)}>
      Clear
    </DropdownItem>
  ];

  const notificationDrawer = (
    <NotificationDrawer>
      <NotificationDrawerHeader count={getUnreadNotificationsNumber()} onClose={(_event) => setDrawerExpanded(false)}>
        <Dropdown
          id="notification-drawer-0"
          isOpen={openDropdownKey === 'dropdown-toggle-id-0'}
          onSelect={onDropdownSelect}
          popperProps={{ position: 'right' }}
          onOpenChange={(isOpen: boolean) => !isOpen && setOpenDropdownKey(null)}
          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
            <MenuToggle
              ref={toggleRef}
              isExpanded={openDropdownKey === 'dropdown-toggle-id-0'}
              variant="plain"
              onClick={() => onDropdownToggle('dropdown-toggle-id-0')}
              aria-label="Notification drawer actions"
              icon={<EllipsisVIcon />}
            />
          )}
        >
          <DropdownList>{notificationDrawerActions}</DropdownList>
        </Dropdown>
      </NotificationDrawerHeader>
      <NotificationDrawerBody>
        {notifications.length !== 0 && (
          <NotificationDrawerList>
            {notifications.map(({ key, variant, title, srTitle, description, timestamp }, index) => (
              <NotificationDrawerListItem
                key={key}
                variant={variant}
                isRead={isNotificationRead(key)}
                onClick={() => markNotificationRead(key)}
              >
                <NotificationDrawerListItemHeader variant={variant} title={title} srTitle={srTitle}>
                  <Dropdown
                    id={key.toString()}
                    isOpen={openDropdownKey === key}
                    onSelect={onDropdownSelect}
                    popperProps={{ position: 'right' }}
                    onOpenChange={(isOpen: boolean) => !isOpen && setOpenDropdownKey(null)}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        isExpanded={openDropdownKey === key}
                        variant="plain"
                        onClick={() => onDropdownToggle(key)}
                        aria-label={`Notification ${index + 1} actions`}
                      >
                        <EllipsisVIcon aria-hidden="true" />
                      </MenuToggle>
                    )}
                  >
                    <DropdownList>{notificationDrawerDropdownItems(key)}</DropdownList>
                  </Dropdown>
                </NotificationDrawerListItemHeader>
                <NotificationDrawerListItemBody timestamp={timestamp}> {description} </NotificationDrawerListItemBody>
              </NotificationDrawerListItem>
            ))}
          </NotificationDrawerList>
        )}
        {notifications.length === 0 && (
          <EmptyState headingLevel="h2" titleText="No notifications found" icon={SearchIcon} variant={EmptyStateVariant.full}>
            <EmptyStateBody>There are currently no notifications.</EmptyStateBody>
          </EmptyState>
        )}
      </NotificationDrawerBody>
    </NotificationDrawer>
  );


  // Navigation
  const location = useLocation();

  const renderNavItem = (route: IAppRoute, index: number) => (
    <NavItem key={`${route.label}-${index}`} id={`${route.label}-${index}`} isActive={route.path.split('/')[1] === location.pathname.split('/')[1]} className='navitem-flex'>
      <NavLink to={route.path} className={route.path !== '#' ? '' : 'disabled-link'}>
        {t(route.label as string)}
      </NavLink>
    </NavItem>
  );

  const renderNavGroup = (group: IAppRouteGroup, groupIndex: number) => (
    <NavExpandable
      key={`${group.label}-${groupIndex}`}
      id={`${group.label}-${groupIndex}`}
      title={group.label}
      isActive={group.routes.some((route) => route.path === location.pathname)}
      isExpanded={group.isExpanded}
    >
      {group.routes.map((route, idx) => route.label && renderNavItem(route, idx))}
    </NavExpandable>
  );

  const Navigation = (
    <Nav id="nav-first-simple" >
      <NavList id="nav-list-first-simple">
        {routes.map(
          (route, idx) => {
            if ('path' in route) {
              // This route is an IAppRoute because it has a 'path' property
              return route.label && renderNavItem(route, idx);
            } else if ('routes' in route) {
              // This route is an IAppRouteGroup because it has a 'routes' property
              return route.label && renderNavGroup(route, idx);
            }
            return null;
          }
        )}
      </NavList>
    </Nav>
  );

  const Sidebar = (
    <PageSidebar  >
      <PageSidebarBody isFilled>
        {Navigation}
      </PageSidebarBody>
    </PageSidebar>
  );


  // Header
  const HeaderTools = ({
    isDarkTheme,
    setIsDarkTheme
  }) => {

    const toggleDarkTheme = (_evt, selected) => {
      const darkThemeToggleClicked = !selected === isDarkTheme;
      const htmlElement = document.querySelector('html');
      if (htmlElement) {
        htmlElement.classList.toggle('pf-v6-theme-dark', darkThemeToggleClicked);
      }
      setIsDarkTheme(darkThemeToggleClicked);
    };

    const [isLanguageDropdownOpen, setLanguageDropdownOpen] = React.useState(false);

    return (
      <Toolbar isFullHeight>
        <ToolbarContent>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ToggleGroup aria-label="Dark theme toggle group">
                <ToggleGroupItem
                  aria-label="light theme toggle"
                  icon={<SunIcon />}
                  isSelected={!isDarkTheme}
                  onChange={toggleDarkTheme}
                />
                <ToggleGroupItem
                  aria-label="dark theme toggle"
                  icon={<MoonIcon />}
                  isSelected={isDarkTheme}
                  onChange={toggleDarkTheme}
                />
              </ToggleGroup>
            </ToolbarItem>
            <ToolbarItem>
              <Dropdown
                onSelect={() => setLanguageDropdownOpen(!isLanguageDropdownOpen)}
                onOpenChange={(isOpen) => setLanguageDropdownOpen(isOpen)}
                isOpen={isLanguageDropdownOpen}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setLanguageDropdownOpen(!isLanguageDropdownOpen)}
                    isExpanded={isLanguageDropdownOpen}
                  >
                    {supportedLngs[selectedLanguage] || 'en'}
                  </MenuToggle>
                )}
                popperProps={{ position: 'right' }}
              >
                <DropdownGroup key="Language" label="Language">
                  <DropdownList>
                    {Object.entries(supportedLngs).map(([lngCode, lngName], index) => (
                      <DropdownItem key={index} value={lngCode} label={lngName} onClick={() => onChangeLanguage(null as any, lngCode)}>
                        {lngName}
                      </DropdownItem>
                    ))}
                  </DropdownList>
                </DropdownGroup>
              </Dropdown>
            </ToolbarItem>
            {notificationBadge}
            <ToolbarItem>
              <Popover
                aria-label="Help"
                position="right"
                headerContent={t('app_header.help.header')}
                bodyContent={t('app_header.help.body')}
                footerContent={t('app_header.help.footer')}
              >
                <Button aria-label="Help" variant={ButtonVariant.plain} icon={<QuestionCircleIcon />} />
              </Popover>
            </ToolbarItem>
            <ToolbarItem>
              <Flex direction={{ default: 'column' }} alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentCenter' }} className='pf-v5-global--spacer--md'>
                <Content component={ContentVariants.p}>
                  {userName}
                </Content>
              </Flex>
            </ToolbarItem>
            <ToolbarItem>
              <Avatar src={imgAvatar} alt="" isBordered className='avatar' />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>
    );
  };

  const Header = (
    <Masthead role="banner" aria-label="page masthead">
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton id="page-nav-toggle" variant="plain" aria-label="Dashboard navigation">
            <BarsIcon />
          </PageToggleButton>
        </MastheadToggle>
        <MastheadBrand data-codemods>
          <MastheadLogo data-codemods style={{ width: 'auto' }}>
            <Flex direction={{ default: 'row' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'nowrap' }}>
              <Brand src={!isDarkTheme ? logoStd : logoReverse} alt="ODH Logo" heights={{ default: '36px' }} />
              <Content component={ContentVariants.h3} style={{ marginLeft: '1rem' }} className='title-text'>Tools &amp; Extensions Companion</Content>
            </Flex>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <HeaderTools isDarkTheme={isDarkTheme} setIsDarkTheme={setIsDarkTheme} />
      </MastheadContent>
    </Masthead>
  );

  const pageId = 'primary-app-container';

  const PageSkipToContent = (
    <SkipToContent onClick={(event) => {
      event.preventDefault();
      const primaryContentContainer = document.getElementById(pageId);
      primaryContentContainer && primaryContentContainer.focus();
    }} href={`#${pageId}`}>
      Skip to Content
    </SkipToContent>
  );

  const [isDisclaimerModalOpen, setIsDisclaimerModalOpen] = React.useState(false);
  const handleDisclaimerModalToggle = () => {
    setIsDisclaimerModalOpen(!isDisclaimerModalOpen);
  }

  // Load disclaimer status at startup by calling the backend API
  React.useEffect(() => {
    axios.get(`${config.backend_api_url}/disclaimer`)
      .then((response) => {
        if (response.data.disclaimer.status === 'accepted') {
          console.log('Disclaimer already accepted');
        } else {
          setIsDisclaimerModalOpen(true);
        }
      })
      .catch((error) => {
        console.log(error);
        setIsDisclaimerModalOpen(true);
      });
  }, []);

  // Save disclaimer status to the backend API
  const saveDisclaimerStatus = () => {
    axios.put(`${config.backend_api_url}/disclaimer`, { status: 'accepted' })
      .then((response) => {
        setIsDisclaimerModalOpen(false);
        console.log(response);
      })
      .catch((error) => {
        setIsDisclaimerModalOpen(false);
        console.log(error);
      });
  }

  return (
    <Page
      mainContainerId={pageId}
      masthead={Header}
      sidebar={Sidebar}
      skipToContent={PageSkipToContent}
      notificationDrawer={notificationDrawer}
      isNotificationDrawerExpanded={isDrawerExpanded}
      isManagedSidebar
    >
      {children}
      <AlertGroup isToast isLiveRegion onOverflowClick={onAlertGroupOverflowClick} overflowMessage={overflowMessage}>
        {alerts.slice(0, maxDisplayed)}
      </AlertGroup>
      <Modal
        title={"Disclaimer"}
        titleIconVariant="info"
        className="bucket-modal"
        isOpen={isDisclaimerModalOpen}
        onClose={handleDisclaimerModalToggle}
        actions={[
          <Button key="accept" variant="primary" onClick={saveDisclaimerStatus}>
            Accept
          </Button>
        ]}>
          <Content component={ContentVariants.p}>
            This application is provided "as is" under a MIT licence, without any warranty of any kind.<br />
            Please refer to the <a href='https://github.com/opendatahub-io-contrib/odh-tec/blob/main/LICENSE' target='_blank'>license file</a> for more details
          </Content>
      </Modal>
    </Page>
  );
};

export { AppLayout };
