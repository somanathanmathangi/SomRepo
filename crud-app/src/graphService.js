const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

/**
 * Service to handle Microsoft Graph API interactions for SharePoint.
 */
class GraphService {
    constructor() {
        this.msalConfig = {
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
            }
        };

        this.tokenRequest = {
            scopes: ['https://graph.microsoft.com/.default'],
        };

        this.cca = new msal.ConfidentialClientApplication(this.msalConfig);
    }

    /**
     * Acquires an access token using client credentials.
     */
    async getAccessToken() {
        try {
            const response = await this.cca.acquireTokenByClientCredential(this.tokenRequest);
            return response.accessToken;
        } catch (error) {
            console.error('Error acquiring access token:', error);
            throw error;
        }
    }

    /**
     * Uploads a file to SharePoint.
     * @param {string} fileName - Name of the file.
     * @param {Buffer} fileBuffer - File content.
     * @param {string} siteId - SharePoint Site ID.
     * @param {string} driveId - SharePoint Drive ID.
     */
    async uploadToSharePoint(fileName, fileBuffer, siteId, driveId) {
        const accessToken = await this.getAccessToken();
        const client = Client.init({
            authProvider: (done) => {
                done(null, accessToken);
            }
        });

        // Use the large file upload if needed, but for simplicity, we use the simple PUT request
        // which supports up to 4MB. For larger files, an upload session should be created.
        const response = await client.api(`/sites/${siteId}/drives/${driveId}/root:/${fileName}:/content`)
            .put(fileBuffer);
        
        return response;
    }
}

module.exports = new GraphService();
