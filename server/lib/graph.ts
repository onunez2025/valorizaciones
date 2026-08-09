import axios from 'axios';
import { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } from './config.js';

export async function getGraphToken() {
    const url = `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        client_id: MS_GRAPH_CLIENT_ID || '',
        client_secret: MS_GRAPH_CLIENT_SECRET || '',
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default'
    });
    const resp = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return resp.data.access_token;
}
