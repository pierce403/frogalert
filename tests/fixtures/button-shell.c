static uint16_t btn_task(tmosTaskID, uint16_t);

void btn_init()
{
	GPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);
	GPIOB_ModeCfg(KEY2_PIN, GPIO_ModeIN_PU);
}

static void check(int k)
{
	static int hold[KEY_INDEX], is_longpress[KEY_INDEX];
	if (debounce(k, isPressed(k))) {
		hold[k]++;
		if (hold[k] >= LONGPRESS_THRES && is_longpress[k] == 0) {
			is_longpress[k] = 1;
			longPressPending[k] = true;
			if (button_task_id != INVALID_TASK_ID) {
				tmos_set_event(button_task_id, BTN_PRESS);
			}
		}
	} else {
		if (hold[k] > 0 && hold[k] < LONGPRESS_THRES) {
			onePressPending[k] = true;
			if (button_task_id != INVALID_TASK_ID) {
				tmos_set_event(button_task_id, BTN_PRESS);
			}
		}
	}
}
