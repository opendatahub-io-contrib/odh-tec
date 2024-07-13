import config from '@app/config';
import axios from 'axios';
import * as React from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import Emitter from '../../utils/emitter';
import { Page, PageSection, Text, TextContent, TextVariants, Form, FormGroup, Button, TextInput, TextInputGroup, TextInputGroupMain, TextInputGroupUtilities, Flex, FlexItem, TabTitleIcon, Slider, SliderOnChangeEvent } from '@patternfly/react-core';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { EyeIcon } from '@patternfly/react-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBucket } from '@fortawesome/free-solid-svg-icons';
import HfLogo from '@app/assets/bgimages/hf-logo.svg';

interface SettingsProps { }

class S3Settings {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint: string;

    constructor(accessKeyId: string, secretAccessKey: string, region: string, endpoint: string) {
        this.accessKeyId = accessKeyId ?? '';
        this.secretAccessKey = secretAccessKey ?? '';
        this.region = region ?? '';
        this.endpoint = endpoint ?? '';
    }
}

class HuggingFaceSettings {
    hfToken: string;

    constructor(hfToken: string) {
        this.hfToken = hfToken ?? '';
    }
}

const SettingsManagement: React.FunctionComponent<SettingsProps> = () => {
    const history = useHistory();
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

    const [s3Settings, setS3Settings] = React.useState<S3Settings>(new S3Settings('', '', '', ''));
    const [s3SettingsChanged, setS3SettingsChanged] = React.useState<boolean>(false);

    const [showS3SecretKey, setS3ShowSecretKey] = React.useState<boolean>(false);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/s3`)
            .then((response) => {
                const { settings } = response.data;
                if (settings !== undefined) {
                    setS3Settings(new S3Settings(settings.accessKeyId, settings.secretAccessKey, settings.region, settings.endpoint));
                }
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('error', 'Failed to fetch configuration settings.');
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
            })
            .catch((error) => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: '', description: 'Saving failed with the error: ' + error });
            });
    };

    const handleTestS3Connection = (event) => {
        event.preventDefault();
        axios.post(`${config.backend_api_url}/settings/test-s3`, s3Settings)
            .then((response) => {
                Emitter.emit('notification', { variant: 'success', title: '', description: 'Connection successful!' });
            })
            .catch((error) => {
                Emitter.emit('notification', { variant: 'warning', title: '', description: 'Connection failed with the error: ' + error.response.data.message.Code });
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
                Emitter.emit('error', 'Failed to fetch configuration settings.');
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
                Emitter.emit('notification', { variant: 'warning', title: '', description: 'Saving failed with the error: ' + error });
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
                Emitter.emit('notification', { variant: 'warning', title: '', description: 'Connection failed with the error: ' + error.response.data.message.error });
            });
    }

    /* Max Concurrent Transfers Management */

    const [maxConcurrentTransfers, setMaxConcurrentTransfers] = React.useState<number>(0);

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
                Emitter.emit('error', 'Failed to fetch configuration settings.');
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
                Emitter.emit('notification', { variant: 'warning', title: '', description: 'Saving failed with the error: ' + error });
            });
    };

    /* Render */

    return (
        <Page className='buckets-list'>
            <PageSection>
                <TextContent>
                    <Text component={TextVariants.h1}>Settings</Text>
                </TextContent>
            </PageSection>
            <PageSection>
                <Tabs
                    activeKey={activeTabKey}
                    onSelect={handleTabClick}
                    aria-label="Settings Tabs"
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
                                        <Button
                                            variant="plain"
                                            aria-label={showS3SecretKey ? 'Hide secret key' : 'Show secret key'}
                                            onClick={() => setS3ShowSecretKey(!showS3SecretKey)}
                                        >
                                            <EyeIcon />
                                        </Button>
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
                                        <Button
                                            variant="plain"
                                            aria-label={showHfToken ? 'Hide token' : 'Show token'}
                                            onClick={() => setHfShowToken(!showHfToken)}
                                        >
                                            <EyeIcon />
                                        </Button>
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
                </Tabs>
            </PageSection>
        </Page>
    );
};

export default SettingsManagement;
