use reina_path::{
    get_base_data_dir_for_mode, initialize_environment, is_portable_mode, RuntimeEnvironment,
};

#[test]
fn preview_uses_its_own_data_even_when_portable_is_requested() {
    let preview = RuntimeEnvironment::Preview;
    assert_ne!(
        preview.identifier(),
        RuntimeEnvironment::Production.identifier()
    );
    assert_ne!(
        preview.identifier(),
        RuntimeEnvironment::Development.identifier()
    );
    initialize_environment(preview).unwrap();

    let standard = get_base_data_dir_for_mode(false).unwrap();
    let portable = get_base_data_dir_for_mode(true).unwrap();
    assert_eq!(standard, portable);
    assert_eq!(standard.file_name().unwrap(), preview.identifier());
    assert!(!is_portable_mode());
    assert!(preview.is_development());
    assert!(initialize_environment(RuntimeEnvironment::Production).is_err());
}
