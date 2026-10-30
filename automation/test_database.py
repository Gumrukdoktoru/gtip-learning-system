import unittest
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock,patch
from database import Database,DatabaseConfigError,normalize_database_url,trusted_ca_file


class DatabaseConfigTests(unittest.TestCase):
    url='postgresql://fixture:fake_password@db.example.test/neondb?sslmode=require'

    def test_plain_url_is_preserved(self):
        self.assertEqual(normalize_database_url(self.url),self.url)

    def test_neon_psql_copy_is_parsed_without_running_a_command(self):
        self.assertEqual(normalize_database_url('psql '+repr(self.url)),self.url)

    def test_quoted_url_and_surrounding_whitespace_are_accepted(self):
        self.assertEqual(normalize_database_url('  "'+self.url+'"\n'),self.url)

    def test_neon_environment_copy_formats_are_accepted_as_data(self):
        for prefix in ('DATABASE_URL=','export DATABASE_URL='):
            self.assertEqual(normalize_database_url(prefix+repr(self.url)),self.url)

    def test_extra_commands_and_arguments_are_rejected(self):
        for value in ('psql '+repr(self.url)+' -c SELECT', 'psql '+repr(self.url)+'; echo no'):
            with self.assertRaises(DatabaseConfigError):normalize_database_url(value)

    def test_invalid_values_fail_without_echoing_the_input(self):
        for value in ('', 'https://private-password.example.test', 'psql "unfinished-private-password'):
            with self.assertRaises(DatabaseConfigError) as caught:normalize_database_url(value)
            self.assertNotIn('private-password',str(caught.exception))

    def test_postgres_uses_an_existing_python_ca_file_with_full_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'test-root.pem';root.write_text('Fixture for CA path selection only')
            connect=Mock(return_value=Mock())
            with patch('database.ssl.get_default_verify_paths',return_value=SimpleNamespace(cafile=str(root))), \
                 patch.dict('sys.modules',{'psycopg':SimpleNamespace(connect=connect)}):
                with Database(Path(temp)/'unused.db',{'DATABASE_URL':self.url}).connect():pass
            self.assertEqual(connect.call_args.kwargs['sslrootcert'],str(root))
            self.assertEqual(connect.call_args.kwargs['sslmode'],'verify-full')

    def test_custom_ca_override_keeps_full_verification(self):
        connect=Mock(return_value=Mock())
        with patch.dict('sys.modules',{'psycopg':SimpleNamespace(connect=connect)}):
            with Database('/tmp/unused-test.db',{'DATABASE_URL':self.url,
                          'PGSSLROOTCERT':'/custom/ca.pem'}).connect():pass
        self.assertEqual(connect.call_args.kwargs['sslrootcert'],'/custom/ca.pem')
        self.assertEqual(connect.call_args.kwargs['sslmode'],'verify-full')

    def test_no_available_ca_bundle_fails_without_disabling_verification(self):
        with patch('database.ssl.get_default_verify_paths',return_value=SimpleNamespace(cafile=None)), \
             patch('database.Path.is_file',return_value=False):
            with self.assertRaises(RuntimeError):trusted_ca_file({})


if __name__=='__main__':unittest.main(verbosity=2)
