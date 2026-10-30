import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient
import httpx
from panel import create_app
from social_connections import ConnectionFailure, SocialConnections


class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.db=self.root/'social.sqlite3'
        self.config={'PUBLIC_BASE_URL':'https://review.example.test',
            'INSTAGRAM_APP_ID':'test-instagram-app','INSTAGRAM_APP_SECRET':'fake-instagram-secret',
            'LINKEDIN_CLIENT_ID':'test-linkedin-app','LINKEDIN_CLIENT_SECRET':'fake-linkedin-secret',
            'TOKEN_ENCRYPTION_KEY':'only-for-tests-a-long-random-looking-test-key-123456'}
        self.requests=[]

    def tearDown(self):
        self.temp.cleanup()

    def handler(self,request):
        self.requests.append(request)
        host,path=request.url.host,request.url.path
        if host=='api.instagram.com' and path=='/oauth/access_token':
            return httpx.Response(200,json={'data':[{'access_token':'FAKE-SHORT-TOKEN',
                'permissions':['instagram_business_basic','instagram_business_content_publish']}]})
        if host=='graph.instagram.com' and path=='/access_token':
            return httpx.Response(200,json={'access_token':'FAKE-LONG-INSTAGRAM-TOKEN','expires_in':5184000})
        if host=='graph.instagram.com' and path=='/me':
            return httpx.Response(200,json={'user_id':'test-ig-id','username':'test_author'})
        if host=='www.linkedin.com' and path=='/oauth/v2/accessToken':
            return httpx.Response(200,json={'access_token':'FAKE-LINKEDIN-TOKEN','expires_in':3600,
                'scope':'openid profile w_member_social'})
        if host=='api.linkedin.com' and path=='/v2/userinfo':
            return httpx.Response(200,json={'sub':'test-person-id','name':'Test Author'})
        raise AssertionError('Unexpected provider request')

    def manager(self,config=None,handler=None):
        return SocialConnections(self.db,self.config if config is None else config,
                                 httpx.MockTransport(handler or self.handler))

    def start_state(self,manager,provider):
        return parse_qs(urlsplit(manager.start(provider)).query)['state'][0]

    def test_missing_settings_do_not_show_account_as_connected(self):
        statuses=self.manager({}).statuses()
        self.assertFalse(statuses['instagram']['connected'])
        self.assertFalse(statuses['linkedin']['configuration_ready'])
        self.assertIn('PUBLIC_BASE_URL',statuses['instagram']['missing_settings'])
        self.assertFalse(statuses['whatsapp']['connected'])
        self.assertFalse(statuses['whatsapp']['publishing_enabled'])

    def test_authorization_uses_trusted_callback_and_minimal_scopes(self):
        m=self.manager()
        url=m.start('linkedin')
        parsed=urlsplit(url);q=parse_qs(parsed.query)
        self.assertEqual(parsed.netloc,'www.linkedin.com')
        self.assertEqual(q['redirect_uri'],['https://review.example.test/auth/linkedin/callback'])
        self.assertEqual(set(q['scope'][0].split()),{'openid','profile','w_member_social'})
        self.assertNotIn('fake-linkedin-secret',url)

    def test_http_callback_is_rejected(self):
        config={**self.config,'PUBLIC_BASE_URL':'http://unsafe.example.test'}
        self.assertFalse(self.manager(config).statuses()['instagram']['configuration_ready'])
        with self.assertRaises(ConnectionFailure):self.manager(config).start('instagram')

    def test_linkedin_connection_is_encrypted_and_not_published(self):
        m=self.manager();state=self.start_state(m,'linkedin')
        status=m.complete('linkedin',state,'FAKE-ONE-TIME-CODE')
        self.assertTrue(status['connected'])
        self.assertTrue(status['permissions_confirmed'])
        with sqlite3.connect(self.db) as db:
            stored=db.execute('SELECT encrypted_token FROM social_accounts').fetchone()[0]
        self.assertNotIn(b'FAKE-LINKEDIN-TOKEN',stored)
        public=json.dumps(m.statuses())
        self.assertNotIn('FAKE-LINKEDIN-TOKEN',public)
        self.assertFalse(m.statuses()['linkedin']['publishing_enabled'])

    def test_state_replay_and_wrong_provider_are_rejected(self):
        m=self.manager();state=self.start_state(m,'linkedin')
        with self.assertRaises(ConnectionFailure):m.complete('instagram',state,'CODE')
        self.assertEqual(len(self.requests),0)
        m.complete('linkedin',state,'CODE')
        count=len(self.requests)
        with self.assertRaises(ConnectionFailure):m.complete('linkedin',state,'CODE')
        self.assertEqual(len(self.requests),count)

    def test_expired_state_is_rejected_before_network_work(self):
        m=self.manager();state=self.start_state(m,'linkedin')
        with sqlite3.connect(self.db) as db:db.execute('UPDATE oauth_states SET expires_at=0')
        with self.assertRaises(ConnectionFailure):m.complete('linkedin',state,'CODE')
        self.assertEqual(len(self.requests),0)

    def test_instagram_long_lived_token_and_identity(self):
        m=self.manager();state=self.start_state(m,'instagram')
        status=m.complete('instagram',state,'CODE')
        self.assertEqual(status['account_id'],'test-ig-id')
        self.assertTrue(status['permissions_confirmed'])
        self.assertGreater(status['expires_at'],int(time.time())+3600)
        self.assertEqual(len(self.requests),3)

    def test_failed_identity_does_not_store_a_connection(self):
        def broken(request):
            if request.url.path=='/v2/userinfo':return httpx.Response(403,json={'error':'denied'})
            return self.handler(request)
        m=self.manager(handler=broken);state=self.start_state(m,'linkedin')
        with self.assertRaises(ConnectionFailure):m.complete('linkedin',state,'CODE')
        self.assertFalse(m.statuses()['linkedin']['connected'])

    def test_wrong_instagram_account_is_not_connected(self):
        config={**self.config,'INSTAGRAM_EXPECTED_USERNAME':'gumrukkocunuz'}
        m=self.manager(config);state=self.start_state(m,'instagram')
        with self.assertRaises(ConnectionFailure):m.complete('instagram',state,'CODE')
        self.assertFalse(m.statuses()['instagram']['connected'])

    def test_expected_instagram_account_matches_ignoring_case_and_at(self):
        config={**self.config,'INSTAGRAM_EXPECTED_USERNAME':'@TEST_AUTHOR'}
        m=self.manager(config);state=self.start_state(m,'instagram')
        self.assertTrue(m.complete('instagram',state,'CODE')['connected'])
        self.assertEqual(m.statuses()['instagram']['expected_username'],'test_author')

    def test_provider_error_is_redacted(self):
        def broken(request):return httpx.Response(400,json={'error_description':'PRIVATE-SERVER-TOKEN'})
        m=self.manager(handler=broken);state=self.start_state(m,'linkedin')
        with self.assertRaises(ConnectionFailure) as captured:m.complete('linkedin',state,'CODE')
        self.assertNotIn('PRIVATE-SERVER-TOKEN',str(captured.exception))
        self.assertNotIn('fake-linkedin-secret',str(captured.exception))

    def test_disconnect_clears_connection(self):
        m=self.manager();state=self.start_state(m,'linkedin');m.complete('linkedin',state,'CODE')
        m.store.disconnect('linkedin')
        self.assertFalse(m.statuses()['linkedin']['connected'])

    def test_routes_are_authenticated_and_no_tokens_in_responses(self):
        app=create_app(self.root/'output',self.db,'test-panel-password',self.config,httpx.MockTransport(self.handler))
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/connections').status_code,401)
            auth=('reviewer','test-panel-password')
            response=client.get('/auth/linkedin/start',auth=auth,follow_redirects=False)
            state=parse_qs(urlsplit(response.headers['location']).query)['state'][0]
            response=client.get('/auth/linkedin/callback',params={'state':state,'code':'CODE'},auth=auth,follow_redirects=False)
            self.assertEqual(response.status_code,303)
            r=client.get('/api/connections',auth=auth)
            self.assertTrue(r.json()['accounts']['linkedin']['connected'])
            self.assertNotIn('FAKE-LINKEDIN-TOKEN',r.text)
            self.assertNotIn('fake-linkedin-secret',r.text)
            self.assertEqual(client.delete('/api/connections/linkedin',auth=auth).status_code,200)


if __name__=='__main__':unittest.main(verbosity=2)
