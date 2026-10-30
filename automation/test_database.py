import unittest
from database import DatabaseConfigError,normalize_database_url


class DatabaseConfigTests(unittest.TestCase):
    url='postgresql://fixture:fake_password@db.example.test/neondb?sslmode=require'

    def test_plain_url_is_preserved(self):
        self.assertEqual(normalize_database_url(self.url),self.url)

    def test_neon_psql_copy_is_parsed_without_running_a_command(self):
        self.assertEqual(normalize_database_url('psql '+repr(self.url)),self.url)

    def test_quoted_url_and_surrounding_whitespace_are_accepted(self):
        self.assertEqual(normalize_database_url('  "'+self.url+'"\n'),self.url)

    def test_extra_commands_and_arguments_are_rejected(self):
        for value in ('psql '+repr(self.url)+' -c SELECT', 'psql '+repr(self.url)+'; echo no'):
            with self.assertRaises(DatabaseConfigError):normalize_database_url(value)

    def test_invalid_values_fail_without_echoing_the_input(self):
        for value in ('', 'https://private-password.example.test', 'psql "unfinished-private-password'):
            with self.assertRaises(DatabaseConfigError) as caught:normalize_database_url(value)
            self.assertNotIn('private-password',str(caught.exception))


if __name__=='__main__':unittest.main(verbosity=2)
