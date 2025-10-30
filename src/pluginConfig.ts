import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-uav-wmocs',
    version: '0.2.1',
    icon: '🚁',
    title: 'UAV WMOCS',
    description: 'Used to display WMOCS data for UAV operations',
    author: 'Byweather (optional company name)',
    repository: 'https://github.com/byw-dev/windy-plugin-template',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/uav-wmocs',
    private: true,
};

export default config;
