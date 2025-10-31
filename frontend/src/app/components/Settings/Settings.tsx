import HfLogo from '@app/assets/bgimages/hf-logo.svg';
import config from '@app/config';
import { faBucket, faNetworkWired } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Content, ContentVariants, Flex, FlexItem, Form, FormGroup, PageSection, Slider, SliderOnChangeEvent, Tab, Tabs, TabTitleIcon, TabTitleText, TextInput, TextInputGroup, TextInputGroupMain, TextInputGroupUtilities } from '@patternfly/react-core';
import { EyeIcon } from '@patternfly/react-icons';
import axios from 'axios';
import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Emitter from '../../utils/emitter';
import { storageService } from '../../services/storageService';

interface SettingsProps { }

class S3Settings {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint: string;
    defaultBucket: string;

    constructor(accessKeyId: string, secretAccessKey: string, region: string, endpoint: string, defaultBucket: string) {
        this.accessKeyId = accessKeyId ?? '';
        this.secretAccessKey = secretAccessKey ?? '';
        this.region = region ?? '';
        this.endpoint = endpoint ?? '';
        this.defaultBucket = defaultBucket ?? '';
    }
}

class HuggingFaceSettings {
    hfToken: string;

    constructor(hfToken: string) {
        this.hfToken = hfToken ?? '';
    }
}

class ProxySettings {
    httpProxy: string;
    httpsProxy: string;
    testUrl: string;

    constructor(httpProxy: string, httpsProxy: string) {
        this.httpProxy = httpProxy ?? '';
        this.httpsProxy = httpsProxy ?? '';
        this.testUrl = 'https://www.google.com';
    }
}

const SettingsManagement: React.FunctionComponent<SettingsProps> = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();

    /* Tabs Management */

    const [activeTabKey, setActiveTabKey] = React.useState<string | number>(0);
    const handleTabClick = (
        event: React.MouseEvent<any> | React.KeyboardEvent | MouseEvent,
        tabIndex: string | number
    ) => {
        setActiveTabKey(tabIndex);
    };

    /* S3 Settings Management */

    const [s3Settings, setS3Settings] = React.useState<S3Settings>(new S3Settings('', '', '', '', ''));
    const [s3SettingsChanged, setS3SettingsChanged] = React.useState<boolean>(false);

    const [showS3SecretKey, setS3ShowSecretKey] = React.useState<boolean>(false);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/s3`)
            .then((response) => {
                const { settings } = response.data;
                if (settings !== undefined) {
                    setS3Settings(new S3Settings(settings.accessKeyId, settings.secretAccessKey, settings.region, settings.endpoint, settings.defaultBucket));
                }
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('error', `Failed to fetch S3 settings: ${error.response?.data?.error ? `${error.response.data.error} - ` : ''}${error.response?.data?.message || 'Server error'}`);
            });
    }, []);

    const handleS3Change = (value, field) => {
        setS3Settings(prevState => ({
            ...prevState,
            [field]: value,
        }));
        setS3SettingsChanged(true);
    };

    const handleSaveS3Settings = (event) => {
        event.preventDefault();
        axios.put(`${config.backend_api_url}/settings/s3`, s3Settings)
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Settings saved successfully!' });
                setS3SettingsChanged(false);
                // Refresh storage locations to reflect new S3 configuration
                storageService.refreshLocations()
                    .catch((error) => {
                        console.error('Failed to refresh storage locations after S3 config update:', error);
                        // Don't show error notification - settings were saved successfully
                    });
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Save Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    };

    const handleTestS3Connection = (event) => {
        event.preventDefault();
        axios.post(`${config.backend_api_url}/settings/test-s3`, s3Settings)
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Connection successful!' });
            })
            .catch((error) => {
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Connection Test Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    }

    /* HuggingFace Settings Management */

    const [hfSettings, setHfSettings] = React.useState<HuggingFaceSettings>(new HuggingFaceSettings(''));
    const [hfSettingsChanged, setHfSettingsChanged] = React.useState<boolean>(false);

    const [showHfToken, setHfShowToken] = React.useState<boolean>(false);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/huggingface`)
            .then((response) => {
                const { settings } = response.data;
                if (settings !== undefined) {
                    setHfSettings(new HuggingFaceSettings(settings.hfToken));
                }
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('error', `Failed to fetch HuggingFace settings: ${error.response?.data?.error ? `${error.response.data.error} - ` : ''}${error.response?.data?.message || 'Server error'}`);
            });
    }, []);

    const handleHfChange = (value, field) => {
        setHfSettings(prevState => ({
            ...prevState,
            [field]: value,
        }));
        setHfSettingsChanged(true);
    };

    const handleSaveHfSettings = (event) => {
        event.preventDefault();
        axios.put(`${config.backend_api_url}/settings/huggingface`, hfSettings)
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Settings saved successfully!' });
                setHfSettingsChanged(false);
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Save Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    };

    const handleTestHfConnection = (event) => {
        event.preventDefault();
        axios.post(`${config.backend_api_url}/settings/test-huggingface`, hfSettings)
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Connection successful! You are using the token named: ' + response.data.accessTokenDisplayName });
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Connection Test Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    }

    /* Max Concurrent Transfers Management */

    const [maxConcurrentTransfers, setMaxConcurrentTransfers] = React.useState<number>(0);
    const [maxFilesPerPage, setMaxFilesPerPage] = React.useState<number>(100);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/max-concurrent-transfers`)
            .then((response) => {
                const { maxConcurrentTransfers } = response.data;
                if (maxConcurrentTransfers !== undefined) {
                    setMaxConcurrentTransfers(maxConcurrentTransfers);
                }
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('error', `Failed to fetch Max Concurrent Transfers settings: ${error.response?.data?.error ? `${error.response.data.error} - ` : ''}${error.response?.data?.message || 'Server error'}`);
            });
    }, []);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/max-files-per-page`)
            .then((response) => {
                const { maxFilesPerPage } = response.data;
                if (maxFilesPerPage !== undefined) {
                    setMaxFilesPerPage(maxFilesPerPage);
                }
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('error', `Failed to fetch Max Files Per Page settings: ${error.response?.data?.error ? `${error.response.data.error} - ` : ''}${error.response?.data?.message || 'Server error'}`);
            });
    }, []);

    const handleSaveMaxConcurrentTransfers = (event) => {
        event.preventDefault();
        axios.put(`${config.backend_api_url}/settings/max-concurrent-transfers`, { maxConcurrentTransfers })
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Settings saved successfully!' });
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Save Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    };

    const handleSaveMaxFilesPerPage = (event) => {
        event.preventDefault();
        axios.put(`${config.backend_api_url}/settings/max-files-per-page`, { maxFilesPerPage })
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Settings saved successfully!' });
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Save Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    };

    /* Proxy Settings Management */

    const [proxySettings, setProxySettings] = React.useState<ProxySettings>(new ProxySettings('', ''));
    const [proxySettingsChanged, setProxySettingsChanged] = React.useState<boolean>(false);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/proxy`)
            .then((response) => {
                const { settings } = response.data;
                if (settings !== undefined) {
                    setProxySettings(new ProxySettings(settings.httpProxy, settings.httpsProxy));
                }
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('error', `Failed to fetch proxy settings: ${error.response?.data?.error ? `${error.response.data.error} - ` : ''}${error.response?.data?.message || 'Server error'}`);
            });
    }, []);

    const handleProxyChange = (value, field) => {
        setProxySettings(prevState => ({
            ...prevState,
            [field]: value,
        }));
        setProxySettingsChanged(true);
    };

    const handleSaveProxySettings = (event) => {
        event.preventDefault();
        axios.put(`${config.backend_api_url}/settings/proxy`, {
            httpProxy: proxySettings.httpProxy,
            httpsProxy: proxySettings.httpsProxy
        })
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Proxy settings saved successfully!' });
                setProxySettingsChanged(false);
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Save Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    };

    const handleTestProxyConnection = (event) => {
        event.preventDefault();
        axios.post(`${config.backend_api_url}/settings/test-proxy`, {
            httpProxy: proxySettings.httpProxy, 
            httpsProxy: proxySettings.httpsProxy, 
            testUrl: proxySettings.testUrl
        })
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Proxy connection successful!' });
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Connection Test Failed', description: error.response?.data?.message || 'An unknown error occurred' });
            });
    };

    /* Render */

    return (
        <div>
            <PageSection hasBodyWrapper={false}>
                <Content>
                    <Content component={ContentVariants.h1}>Settings</Content>
                </Content>
            </PageSection>
            <PageSection hasBodyWrapper={false}>
                <Tabs
                    activeKey={activeTabKey}
                    onSelect={handleTabClick}
                    aria-label="Settings Tabs"
                    isBox={false}
                    role="region"
                >
                    <Tab
                        eventKey={0}
                        title={
                            <>
                                <TabTitleIcon>
                                    <FontAwesomeIcon icon={faBucket} />
                                </TabTitleIcon>{' '}
                                <TabTitleText>S3 Settings</TabTitleText>{' '}
                            </>
                        }
                        aria-label="S3 settings"
                    >
                        <Form onSubmit={handleSaveS3Settings}
                            className='settings-form'>
                            <FormGroup label="Access key" fieldId="accessKeyId">
                                <TextInput
                                    value={s3Settings.accessKeyId}
                                    onChange={(_event, value) => handleS3Change(value, 'accessKeyId')}
                                    id="accessKeyId"
                                    name="accessKeyId"
                                    className='form-settings'
                                />
                            </FormGroup>
                            <FormGroup label="Secret key" fieldId="secretAccessKey">
                                <TextInputGroup className='form-settings'>
                                    <TextInputGroupMain
                                        value={s3Settings.secretAccessKey}
                                        onChange={(_event, value) => handleS3Change(value, 'secretAccessKey')}
                                        id="secretAccessKey"
                                        name="secretAccessKey"
                                        type={showS3SecretKey ? 'text' : 'password'}
                                    />
                                    <TextInputGroupUtilities>
                                        <Button icon={<EyeIcon />}
                                            variant="plain"
                                            aria-label={showS3SecretKey ? 'Hide secret key' : 'Show secret key'}
                                            onClick={() => setS3ShowSecretKey(!showS3SecretKey)}
                                        />
                                    </TextInputGroupUtilities>
                                </TextInputGroup>
                            </FormGroup>
                            <FormGroup label="Region" fieldId="region">
                                <TextInput
                                    value={s3Settings.region}
                                    onChange={(_event, value) => handleS3Change(value, 'region')}
                                    id="region"
                                    name="region"
                                    className='form-settings'
                                />
                            </FormGroup>
                            <FormGroup label="Endpoint" fieldId="endpoint">
                                <TextInput
                                    value={s3Settings.endpoint}
                                    onChange={(_event, value) => handleS3Change(value, 'endpoint')}
                                    id="endpoint"
                                    name="endpoint"
                                    className='form-settings-long'
                                />
                            </FormGroup>
                            <FormGroup label="Default Bucket" fieldId="defaultBucket">
                                <TextInput
                                    value={s3Settings.defaultBucket}
                                    onChange={(_event, value) => handleS3Change(value, 'defaultBucket')}
                                    id="defaultBucket"
                                    name="defaultBucket"
                                    className='form-settings'
                                />
                            </FormGroup>
                            <Flex>
                                <FlexItem>
                                    <Button type="submit" className='form-settings-submit' isDisabled={!s3SettingsChanged}>Save S3 Settings</Button>
                                </FlexItem>
                                <FlexItem>
                                    <Button className='form-settings-submit' onClick={handleTestS3Connection}>Test Connection</Button>
                                </FlexItem>
                            </Flex>
                        </Form>
                    </Tab>
                    <Tab eventKey={1}
                        title={
                            <>
                                <TabTitleIcon>
                                    <img className='tab-logo' src={HfLogo} alt="HuggingFace Logo" />
                                </TabTitleIcon>{' '}
                                <TabTitleText>HuggingFace Settings</TabTitleText>{' '}
                            </>
                        }
                        aria-label="HuggingFace settings">
                        <Form onSubmit={handleSaveHfSettings}
                            className='settings-form'>
                            <FormGroup label="Token" fieldId="token">
                                <TextInputGroup className='form-settings'>
                                    <TextInputGroupMain
                                        value={hfSettings.hfToken}
                                        onChange={(_event, value) => handleHfChange(value, 'hfToken')}
                                        id="hfToken"
                                        name="hfToken"
                                        type={showHfToken ? 'text' : 'password'}
                                    />
                                    <TextInputGroupUtilities>
                                        <Button icon={<EyeIcon />}
                                            variant="plain"
                                            aria-label={showHfToken ? 'Hide token' : 'Show token'}
                                            onClick={() => setHfShowToken(!showHfToken)}
                                        />
                                    </TextInputGroupUtilities>
                                </TextInputGroup>
                            </FormGroup>
                            <Flex>
                                <FlexItem>
                                    <Button type="submit" className='form-settings-submit' isDisabled={!hfSettingsChanged}>Save HuggingFace Settings</Button>
                                </FlexItem>
                                <FlexItem>
                                    <Button className='form-settings-submit' onClick={handleTestHfConnection}>Test Connection</Button>
                                </FlexItem>
                            </Flex>
                        </Form>
                    </Tab>
                    <Tab eventKey={2}
                        title={
                            <>
                                <TabTitleIcon>
                                    <FontAwesomeIcon icon={faBucket} />
                                </TabTitleIcon>{' '}
                                <TabTitleText>Max Concurrent Transfers</TabTitleText>{' '}
                            </>
                        }
                        aria-label="Max concurrent transfers">
                        <Form onSubmit={handleSaveMaxConcurrentTransfers}
                            className='settings-form'>
                            <FormGroup label={"Max Concurrent Transfers: " + maxConcurrentTransfers} fieldId="maxConcurrentTransfers">
                                <Slider
                                    hasTooltipOverThumb={false}
                                    value={maxConcurrentTransfers}
                                    min={1}
                                    max={10}
                                    className='form-settings-slider'
                                    onChange={(_event: SliderOnChangeEvent, value: number) => setMaxConcurrentTransfers(value)}
                                />
                            </FormGroup>
                            <Button type="submit" className='form-settings-submit'>Save Max Concurrent Transfers</Button>
                        </Form>
                    </Tab>
                    <Tab eventKey={3}
                        title={
                            <>
                                <TabTitleIcon>
                                    <FontAwesomeIcon icon={faBucket} />
                                </TabTitleIcon>{' '}
                                <TabTitleText>Max Files Per Page</TabTitleText>{' '}
                            </>
                        }
                        aria-label="Max files per page">
                        <Form onSubmit={handleSaveMaxFilesPerPage}
                            className='settings-form'>
                            <FormGroup label={"Max Files Per Page: " + maxFilesPerPage} fieldId="maxFilesPerPage">
                                <Slider
                                    hasTooltipOverThumb={false}
                                    value={maxFilesPerPage}
                                    min={10}
                                    max={1000}
                                    step={10}
                                    className='form-settings-slider'
                                    onChange={(_event: SliderOnChangeEvent, value: number) => setMaxFilesPerPage(value)}
                                />
                            </FormGroup>
                            <Button type="submit" className='form-settings-submit'>Save Max Files Per Page</Button>
                        </Form>
                    </Tab>
                    <Tab eventKey={4}
                        title={
                            <>
                                <TabTitleIcon>
                                    <FontAwesomeIcon icon={faNetworkWired} />
                                </TabTitleIcon>{' '}
                                <TabTitleText>Proxy Settings</TabTitleText>{' '}
                            </>
                        }
                        aria-label="Proxy settings">
                        <Form onSubmit={handleSaveProxySettings}
                            className='settings-form'>
                            <FormGroup label="HTTP Proxy" fieldId="httpProxy">
                                <TextInput
                                    value={proxySettings.httpProxy}
                                    onChange={(_event, value) => handleProxyChange(value, 'httpProxy')}
                                    id="httpProxy"
                                    name="httpProxy"
                                    placeholder="http://proxy-server:port"
                                    className='form-settings-long'
                                />
                            </FormGroup>
                            <FormGroup label="HTTPS Proxy" fieldId="httpsProxy">
                                <TextInput
                                    value={proxySettings.httpsProxy}
                                    onChange={(_event, value) => handleProxyChange(value, 'httpsProxy')}
                                    id="httpsProxy"
                                    name="httpsProxy"
                                    placeholder="https://proxy-server:port"
                                    className='form-settings-long'
                                />
                            </FormGroup>
                            <FormGroup label="Test URL" fieldId="testUrl">
                                <TextInput
                                    value={proxySettings.testUrl}
                                    onChange={(_event, value) => handleProxyChange(value, 'testUrl')}
                                    id="testUrl"
                                    name="testUrl"
                                    placeholder="https://www.google.com"
                                    className='form-settings-long'
                                />
                            </FormGroup>
                            <Flex>
                                <FlexItem>
                                    <Button type="submit" className='form-settings-submit' isDisabled={!proxySettingsChanged}>Save Proxy Settings</Button>
                                </FlexItem>
                                <FlexItem>
                                    <Button className='form-settings-submit' onClick={handleTestProxyConnection}>Test Connection</Button>
                                </FlexItem>
                            </Flex>
                        </Form>
                    </Tab>
                </Tabs>
            </PageSection>
        </div>
    );
};

export default SettingsManagement;
