import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Testurio',
  description: 'Declarative E2E/integration testing framework for distributed systems',
  base: '/testurio/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/testurio/favicon.svg' }]
  ],

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Getting Started', link: '/getting-started/introduction' },
      { text: 'Guide', link: '/guide/components' },
      { text: 'API', link: '/api/core' },
      { text: 'Examples', link: '/examples/http' },
      { text: 'Advanced', link: '/advanced/architecture' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/getting-started/introduction' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Quick Start', link: '/getting-started/quick-start' },
            { text: 'Core Concepts', link: '/getting-started/core-concepts' },
          ]
        }
      ],
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Components', link: '/guide/components' },
            { text: 'Protocols', link: '/guide/protocols' },
            { text: 'Hooks & Mocking', link: '/guide/hooks' },
            { text: 'Proxy Mode', link: '/guide/proxy-mode' },
            { text: 'Schema Validation', link: '/guide/schema-validation' },
            { text: 'Test Lifecycle', link: '/guide/test-lifecycle' },
            { text: 'CLI', link: '/guide/cli' },
            { text: 'Reporting', link: '/guide/reporting' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'Core',
          items: [
            { text: 'testurio', link: '/api/core' },
          ]
        },
        {
          text: 'Protocols',
          items: [
            { text: 'protocol-grpc', link: '/api/protocol-grpc' },
            { text: 'protocol-ws', link: '/api/protocol-ws' },
            { text: 'protocol-tcp', link: '/api/protocol-tcp' },
          ]
        },
        {
          text: 'Adapters',
          items: [
            { text: 'adapter-redis', link: '/api/adapter-redis' },
            { text: 'adapter-kafka', link: '/api/adapter-kafka' },
            { text: 'adapter-rabbitmq', link: '/api/adapter-rabbitmq' },
            { text: 'adapter-mongo', link: '/api/adapter-mongo' },
            { text: 'adapter-pg', link: '/api/adapter-pg' },
          ]
        },
        {
          text: 'Reporting',
          items: [
            { text: 'reporter-allure', link: '/api/reporter-allure' },
          ]
        },
        {
          text: 'CLI',
          items: [
            { text: 'CLI', link: '/api/cli' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'HTTP', link: '/examples/http' },
            { text: 'gRPC', link: '/examples/grpc' },
            { text: 'WebSocket', link: '/examples/websocket' },
            { text: 'TCP', link: '/examples/tcp' },
            { text: 'Proxy Mode', link: '/examples/proxy' },
            { text: 'Message Queues', link: '/examples/message-queues' },
            { text: 'DataSources', link: '/examples/datasources' },
            { text: 'Custom Codecs', link: '/examples/custom-codecs' },
          ]
        }
      ],
      '/advanced/': [
        {
          text: 'Advanced',
          items: [
            { text: 'Architecture', link: '/advanced/architecture' },
            { text: 'Custom Protocol', link: '/advanced/custom-protocol' },
            { text: 'Custom Adapter', link: '/advanced/custom-adapter' },
            { text: 'Custom Reporter', link: '/advanced/custom-reporter' },
            { text: 'Custom Codec', link: '/advanced/custom-codec' },
          ]
        }
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/udamir/testurio' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/testurio' },
    ],
    search: {
      provider: 'local'
    },
    editLink: {
      pattern: 'https://github.com/udamir/testurio/edit/main/docs-site/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present Damir Yusipov'
    }
  }
})
