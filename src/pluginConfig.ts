import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-uav-wmocs',
    version: '0.1.0',
    icon: '🚁',
    title: 'UAV WMOCS',
    description: 'Used to display WMOCS data for UAV operations',
    author: 'Byweather (optional company name)',
    repository: 'https://github.com/windycom/windy-plugin-template',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/uav-wmocs',
    private: true,
};

export default config;
