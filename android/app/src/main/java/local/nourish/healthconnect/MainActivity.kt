package local.nourish.healthconnect

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Build
import android.provider.DocumentsContract
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.view.WindowInsets
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import androidx.core.widget.addTextChangedListener
import java.io.File
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var result: TextView
    private lateinit var from: EditText
    private lateinit var to: EditText
    private lateinit var grant: Button
    private lateinit var read: Button
    private lateinit var save: Button
    private lateinit var clear: Button
    private lateinit var transferPanel: WorkspaceTransferPanel
    private lateinit var reconciliationPanel: ReconciliationPanel
    private lateinit var healthExportPanel: HealthExportPanel
    private lateinit var documentExports:DocumentExportOwner
    private lateinit var documentLease:DocumentExportLease
    private val typeChecks = linkedMapOf<ExportType, CheckBox>()
    private var client: HealthConnectClient? = null
    private var pendingFile: File? = null
    private var readJob: Job? = null
    private var saveJob: Job? = null
    private var busy = false

    private val permissionsLauncher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) {
        refreshAccess()
    }
    private val documentLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { response ->
        if (response.resultCode != Activity.RESULT_OK) {
            result.text = getString(R.string.save_cancelled)
            releaseReconciliationDocument()
            setBusy(false)
        } else {
            val uri = response.data?.data
            val file = if(documentLease.requested)documentLease.file else pendingFile
            if (uri == null || file?.isFile != true) { result.text = getString(R.string.no_staged);releaseReconciliationDocument();setBusy(false) }
            else {
                if(documentLease.requested)documentLease.beginCopy()
                setBusy(true)
                saveJob = lifecycleScope.launch {
                    try {
                        withContext(Dispatchers.IO) {
                            try {
                                val output = contentResolver.openOutputStream(uri, "w") ?: throw IOException("Document unavailable")
                                output.use { target -> file.inputStream().use { source ->
                                    val buffer = ByteArray(16 * 1024)
                                    while (true) {
                                        currentCoroutineContext().ensureActive()
                                        val size = source.read(buffer)
                                        if (size < 0) break
                                        target.write(buffer, 0, size)
                                    }
                                    target.flush()
                                } }
                            } catch (error: Throwable) {
                                // This URI was created by this explicit export request.
                                val removed = withContext(NonCancellable) {
                                    runCatching { DocumentsContract.deleteDocument(contentResolver, uri) }.getOrDefault(false)
                                }
                                if (error is CancellationException) throw error
                                throw ExportSaveFailure(removed,error)
                            }
                        }
                        result.text = getString(R.string.json_saved)
                    } catch (_: CancellationException) {
                        result.text = getString(R.string.save_stopped)
                    } catch (error: IOException) {
                        result.text = exportFailureText(error) ?: error.message ?: getString(R.string.save_failed)
                    } finally { releaseReconciliationDocument();setBusy(false) }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pauseUnmigratedNativeFeatures(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        documentExports=DocumentExportOwner(File(filesDir,"reconciliation-document-exports"))
        documentLease=DocumentExportLease(documentExports)
        documentLease.restore(savedInstanceState?.getBoolean("reconciliationDocumentRequested",false)?:false,savedInstanceState?.getString("reconciliationSaveFile"))
        val restored = savedInstanceState?.getString("pendingFile")
        if (restored != null && isExportName(restored)) pendingFile = File(cacheDir, restored).takeIf { it.isFile }
        val abandoned = cacheDir.listFiles()?.filter { isExportName(it.name) && it != pendingFile }.orEmpty()
        abandoned.forEach { it.delete() }
        buildUi()
        if (pendingFile != null) result.text = getString(R.string.staged_ready)
        if (abandoned.any { it.exists() }) result.text = getString(R.string.cache_cleanup_failed)
        if(documentExports.retryCleanup(documentLease.file)>0)result.text=getString(R.string.document_cleanup_pending)
    }

    private fun buildUi() {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 28, 24, 28)
        }
        fun text(value: String, size: Float = 16f): TextView = TextView(this).apply { text = value; textSize = size; setPadding(0, 8, 0, 12); column.addView(this) }
        fun button(label: String, action: () -> Unit): Button = Button(this).apply { text = label; setOnClickListener { action() }; column.addView(this) }
        text(getString(R.string.web_health_title), 25f)
        text(if(NourishingWorkspace.cloudOrigin!=null)"Choose data types and dates, then preview the import." else getString(R.string.read_intro))
        status = text(getString(R.string.checking_health_connect))
        val today = LocalDate.now()
        from = EditText(this).apply { id = View.generateViewId(); inputType = InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_DATE; setSingleLine(); setText(today.minusDays(6).toString()) }
        text(getString(R.string.read_from)).labelFor = from.id
        column.addView(from)
        to = EditText(this).apply { id = View.generateViewId(); inputType = InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_DATE; setSingleLine(); setText(today.toString()) }
        text(getString(R.string.read_to)).labelFor = to.id
        column.addView(to)
        text(getString(R.string.read_date_help))
        ExportType.entries.forEach { type ->
            typeChecks[type] = CheckBox(this).apply { text = getString(R.string.type_label, getString(type.displayLabelResource), type.unit); isChecked = type.selectedInitially; column.addView(this) }
        }
        text(if(NourishingWorkspace.cloudOrigin!=null)"Steps and active calories use Health Connect daily totals." else getString(R.string.read_activity_help))
        grant = button(getString(R.string.grant_read)) {
            val selected = selectedTypes()
            if (selected.isEmpty()) result.text = getString(R.string.select_type)
            else if (client != null) permissionsLauncher.launch(readPermissions(selected))
        }
        read = button(getString(R.string.read_selected)) { readSelected() }
        result = text(getString(R.string.read_empty))
        save = button(getString(R.string.save_json)) {
            require(!documentLease.requested){getString(R.string.finish_reconciliation_picker)}
            if (pendingFile?.isFile == true) documentLauncher.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/json"
                putExtra(Intent.EXTRA_TITLE, "nourish-health-connect-${LocalDate.now()}.json")
                putExtra(Intent.EXTRA_LOCAL_ONLY, true)
            })
        }
        text(getString(R.string.save_document_help))
        clear = button(getString(R.string.clear_staged)) {
            if (clearStaged()) result.text = getString(R.string.cache_cleared)
            else result.text = getString(R.string.cache_cleanup_retry)
            setBusy(false)
        }
        transferPanel = WorkspaceTransferPanel(this, lifecycleScope,
            stagedFile = { pendingFile },
            selection = { selectedTypes() to ExportRange.create(from.text.toString().trim(), to.text.toString().trim(), ZoneId.systemDefault(), Instant.now()) },
            healthClient = { client },
            requestBackgroundPermission = { permissionsLauncher.launch(setOf(BACKGROUND_READ_PERMISSION)) },
            onBusy = { setBusy(it) })
        column.addView(transferPanel)
        if(NourishingWorkspace.cloudOrigin==null)button(getString(R.string.wear_access)) { startActivity(Intent(this,WearSettingsActivity::class.java)) }
        reconciliationPanel=ReconciliationPanel(this,lifecycleScope,
            selection={selectedTypes() to ExportRange.create(from.text.toString().trim(),to.text.toString().trim(),ZoneId.systemDefault(),Instant.now())},healthClient={client},
            saveFile={ file ->
                require(!documentLease.requested){getString(R.string.finish_document_picker)}
                // Clone while foreground still owns the workspace gate. The
                // worker may acknowledge and clean its upload copy afterward.
                try{withContext(Dispatchers.IO){documentLease.begin(file)};documentLauncher.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type="application/json";putExtra(Intent.EXTRA_TITLE,"nourish-reconciliation-${LocalDate.now()}.json");putExtra(Intent.EXTRA_LOCAL_ONLY,true)})}catch(error:Throwable){releaseReconciliationDocument();throw error}
            },onBusy={setBusy(it)})
        column.addView(reconciliationPanel)
        if(NourishingWorkspace.cloudOrigin!=null)reconciliationPanel.visibility=View.GONE
        healthExportPanel=HealthExportPanel(this,lifecycleScope,destination={transferPanel.checkedConnection()},dates={from.text.toString().trim() to to.text.toString().trim()},health={client},grant={permissionsLauncher.launch(it)},onBusy={setBusy(it)})
        column.addView(healthExportPanel)
        if(NourishingWorkspace.cloudOrigin!=null)healthExportPanel.visibility=View.GONE
        button(getString(R.string.health_settings)) {
            runCatching { startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)) }
                .onFailure { result.text = getString(R.string.settings_unavailable) }
        }
        button(getString(R.string.privacy_rationale)) { startActivity(Intent(this, PermissionsRationaleActivity::class.java)) }
        setContentView(ScrollView(this).apply {
            addView(column)
            setOnApplyWindowInsetsListener { _, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val edges = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                    column.setPadding(24 + edges.left, 28 + edges.top, 24 + edges.right, 28 + edges.bottom)
                } else {
                    @Suppress("DEPRECATION")
                    column.setPadding(24 + insets.systemWindowInsetLeft, 28 + insets.systemWindowInsetTop,
                        24 + insets.systemWindowInsetRight, 28 + insets.systemWindowInsetBottom)
                }
                insets
            }
        })
        setBusy(false)
    }

    override fun onResume() { super.onResume(); refreshAccess() }
    override fun onPostCreate(savedInstanceState:Bundle?){
        super.onPostCreate(savedInstanceState)
        // Framework state restoration is complete before user draft listeners.
        typeChecks.values.forEach{it.setOnCheckedChangeListener{_,_->transferPanel.selectionChanged()}}
        from.addTextChangedListener{transferPanel.selectionChanged()};to.addTextChangedListener{transferPanel.selectionChanged()}
    }
    override fun onStop() {
        readJob?.cancel()
        saveJob?.cancel()
        transferPanel.stopRequests()
        reconciliationPanel.stopRequests()
        if (::healthExportPanel.isInitialized) healthExportPanel.stopRequests()
        super.onStop()
    }
    override fun onDestroy() {
        if (::transferPanel.isInitialized) transferPanel.dispose()
        if (::reconciliationPanel.isInitialized) reconciliationPanel.dispose()
        if (::healthExportPanel.isInitialized) healthExportPanel.dispose()
        super.onDestroy()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        pendingFile?.let { outState.putString("pendingFile", it.name) }
        documentLease.savedPickerPath?.let{outState.putString("reconciliationSaveFile",it)}
        outState.putBoolean("reconciliationDocumentRequested",documentLease.pickerPending)
        super.onSaveInstanceState(outState)
    }
    private fun selectedTypes(): Set<ExportType> = typeChecks.filterValues { it.isChecked }.keys.toSet()
    private fun isExportName(name: String): Boolean = Regex("nourish-export-[0-9a-f-]{36}\\.json").matches(name)
    private fun clearStaged(): Boolean {
        val files = cacheDir.listFiles()?.filter { isExportName(it.name) }.orEmpty()
        val cleared = files.map { !it.exists() || it.delete() }.all { it }
        if (pendingFile?.exists() != true) pendingFile = null
        if (::transferPanel.isInitialized) transferPanel.stagedChanged()
        return cleared
    }
    private fun setBusy(value: Boolean) {
        busy = value
        from.isEnabled = !value; to.isEnabled = !value
        typeChecks.values.forEach { it.isEnabled = !value }
        grant.isEnabled = !value && client != null
        read.isEnabled = !value && client != null
        save.isEnabled = !value && pendingFile?.isFile == true&&!documentLease.requested
        clear.isEnabled = !value
        if (::transferPanel.isInitialized) transferPanel.setExternalBusy(value)
        if (::reconciliationPanel.isInitialized) reconciliationPanel.setExternalBusy(value)
        if (::healthExportPanel.isInitialized) healthExportPanel.setExternalBusy(value)
    }
    private fun releaseReconciliationDocument(){
        if(!documentLease.finish())result.text=getString(R.string.document_cleanup_retry)
    }
    private fun refreshAccess() {
        lifecycleScope.launch {
            try {
                when (HealthConnectClient.getSdkStatus(this@MainActivity)) {
                    HealthConnectClient.SDK_AVAILABLE -> {
                        client = HealthConnectClient.getOrCreate(this@MainActivity)
                        val permissions = client!!.permissionController.getGrantedPermissions()
                        val access = readAccessStatus(permissions)
                        status.text = getString(R.string.access_status, access.granted, access.total, ZoneId.systemDefault().id)
                    }
                    HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                        client = null
                        status.text = getString(R.string.provider_update)
                    }
                    else -> { client = null; status.text = getString(R.string.unavailable) }
                }
            } catch (_: Exception) { client = null; status.text = getString(R.string.access_check_failed) }
            setBusy(busy)
            if (::transferPanel.isInitialized) transferPanel.refresh()
        }
    }
    private fun readSelected() {
        val health = client ?: return
        if (busy) return
        val selected = selectedTypes()
        val range = try { ExportRange.create(from.text.toString().trim(), to.text.toString().trim(), ZoneId.systemDefault(), Instant.now()) }
        catch (error: Exception) { result.text = exportFailureText(error) ?: error.message ?: getString(R.string.choose_dates); return }
        if (selected.isEmpty()) { result.text = getString(R.string.select_type); return }
        if (!clearStaged()) { result.text = getString(R.string.clear_before_read); return }
        setBusy(true)
        result.text = getString(R.string.reading)
        readJob = lifecycleScope.launch {
            try {
                val (snapshot, file) = withContext(Dispatchers.IO) {
                    val snapshot = HealthConnectReader(health).read(range, selected)
                    snapshot to stageExport(cacheDir, snapshot)
                }
                pendingFile = file
                transferPanel.stagedChanged()
                val counts = snapshot.records.groupingBy { it.displayLabelResource }.eachCount().entries.joinToString("; ") { getString(R.string.measurement_count, getString(it.key), it.value) }.ifEmpty { getString(R.string.no_measurements) }
                val denied = if (snapshot.denied.isEmpty()) "" else " " + getString(R.string.read_access_missing, snapshot.denied.joinToString { getString(it.displayLabelResource) })
                result.text = resources.getQuantityString(R.plurals.staged_summary, snapshot.records.size, snapshot.records.size, counts, denied)
            } catch (_: CancellationException) { result.text = getString(R.string.read_stopped) }
            catch (_: SecurityException) { result.text = getString(R.string.read_permission_removed) }
            catch (error: ExportByteLimitExceeded) { result.text = exportProblemText(error.code) }
            catch (error: IllegalArgumentException) { result.text = error.message ?: getString(R.string.invalid_export) }
            catch (_: Exception) { result.text = getString(R.string.read_failed) }
            finally { setBusy(false) }
        }
    }
}
