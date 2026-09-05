alter table public.user_preferences
  alter column theme_preference set default 'light',
  alter column theme_control_mode set default 'always';
