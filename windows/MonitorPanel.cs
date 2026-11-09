using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class MonitorPanel : Form {
    readonly Label title = new Label(), detail = new Label(), note = new Label();
    readonly Button start = new Button(), pause = new Button();
    readonly Timer timer = new Timer { Interval = 5000 };
    readonly TextBox url = new TextBox { Dock=DockStyle.Fill };
    readonly Button apply=new Button { Text="Сохранить ссылку", AutoSize=true };
    string savedUrl; bool busy;
    MonitorPanel() {
        Text = "Монитор вакансий HH"; Font = new Font("Segoe UI", 10);
        ClientSize = new Size(645, 424); MinimumSize = new Size(555, 455);
        StartPosition = FormStartPosition.CenterScreen;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), ColumnCount = 1, RowCount = 6 };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 95));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 24)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        title.Font = new Font(Font.FontFamily, 15, FontStyle.Bold); title.Text = "Читаю статус…";
        foreach (var label in new[]{title, detail, note}) {label.Dock = DockStyle.Fill;layout.Controls.Add(label);}
        var actions = new FlowLayoutPanel {Dock=DockStyle.Fill}; start.Text="Запустить"; pause.Text="Пауза";
        var telegram=new Button {Text="Настроить Telegram",AutoSize=true};
        telegram.Click+=(s,e)=>{using(var dialog=new TelegramSetup())dialog.ShowDialog(this);};
        foreach(var b in new[]{start,pause,telegram}) {b.AutoSize=true;actions.Controls.Add(b);}
        layout.Controls.Add(actions);layout.Controls.Add(new Label {Text="Ссылка на поиск вакансий HH · за последние сутки", AutoSize=true});
        var editor=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=2,RowCount=1};editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));editor.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));editor.Controls.Add(url);editor.Controls.Add(apply);layout.Controls.Add(editor);Controls.Add(layout);
        apply.Click+=async (s,e)=>await RefreshPanel("set-url");
        start.Click+=async (s,e)=>await RefreshPanel("start");pause.Click+=async (s,e)=>await RefreshPanel("pause");
        Shown+=async (s,e)=>{await RefreshPanel("status");timer.Start();};timer.Tick+=async (s,e)=>await RefreshPanel("status");
        FormClosed+=(s,e)=>timer.Dispose();
    }
    internal static Dictionary<string,object> Bridge(string action,string input=null) {
        var js=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"scripts","panel.cjs");
        if(!File.Exists(js))throw new Exception("Рядом с панелью не найден scripts/panel.cjs.");
        var node=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"nodejs","node.exe");
        var psi=new ProcessStartInfo(File.Exists(node)?node:"node.exe","\""+js+"\" "+action) {
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=input!=null,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8
        };
        using(var p=Process.Start(psi)) {
            if(input!=null){var bytes=Encoding.UTF8.GetBytes(input);p.StandardInput.BaseStream.Write(bytes,0,bytes.Length);p.StandardInput.Close();}
            var output=p.StandardOutput.ReadToEndAsync();
            if(!p.WaitForExit(action.StartsWith("telegram-")?45000:15000)){p.Kill();throw new Exception("Истекло время ожидания панели.");}
            var result=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(output.Result);
            if(result==null||p.ExitCode!=0)throw new Exception(result!=null&&result.ContainsKey("failure")?Convert.ToString(result["failure"]):"Не удалось прочитать статус.");
            return result;
        }
    }
    async Task RefreshPanel(string action) {
        if(busy)return;busy=true;start.Enabled=pause.Enabled=apply.Enabled=false;var input=action=="set-url"?url.Text:null;
        try {
            var v=await Task.Run(()=>Bridge(action,input));if(IsDisposed)return;
            string actual=(string)v["searchUrl"]; if(savedUrl==null||url.Text==savedUrl||(action=="set-url"&&url.Text==input))url.Text=actual; savedUrl=actual;
            title.Text=(string)v["status"];DateTimeOffset last;
            var time=DateTimeOffset.TryParse((string)v["last"],out last)?last.ToOffset(TimeSpan.FromHours(3)).ToString("dd.MM.yyyy HH:mm")+" МСК":"ещё не было";
            detail.Text="Последняя успешная проверка: "+time+"\nВ последней выдаче: "+v["count"]+"   ·   Проверено дат: "+v["checked"]+"\nИнтервал: "+v["interval"]+" мин   ·   Chrome: "+((bool)v["headless"]?"без окна":"с окном");
            note.Text=String.IsNullOrEmpty((string)v["error"])?"Пауза отключает следующие проверки. Закрытие панели не останавливает монитор.":(string)v["error"];
            if((bool)v["baselinePending"]&&String.IsNullOrEmpty((string)v["error"]))note.Text="Ссылка сохранена. Первая успешная проверка запомнит выдачу без уведомлений.";
            start.Enabled=!(bool)v["enabled"]||!(bool)v["occupied"];pause.Enabled=(bool)v["enabled"];
        } catch(Exception ex){if(!IsDisposed){title.Text="Не удалось выполнить команду";note.Text=ex.Message;start.Enabled=pause.Enabled=true;}}
        finally{busy=false;if(!IsDisposed)apply.Enabled=true;}
    }
    [STAThread] static int Main(string[] args) {
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        using(var form=new MonitorPanel()) {
            if(args.Length==1&&args[0]=="--verify"){try{var v=Bridge("status");return v.ContainsKey("status")?0:1;}catch{return 1;}}
            Application.Run(form);
        }
        return 0;
    }
}

class TelegramSetup : Form {
    readonly TextBox token = new TextBox { UseSystemPasswordChar=true,Dock=DockStyle.Fill };
    readonly LinkLabel bot = new LinkLabel { AutoSize=true, Visible=false };
    readonly Label message = new Label { Dock=DockStyle.Fill };
    readonly Button next = new Button { Text="Проверить токен",AutoSize=true };
    string code, botUrl;

    internal TelegramSetup() {
        Text="Подключение Telegram"; Font=new Font("Segoe UI",10);
        ClientSize=new Size(480,262); FormBorderStyle=FormBorderStyle.FixedDialog;
        MaximizeBox=false; MinimizeBox=false; StartPosition=FormStartPosition.CenterParent;
        var layout=new TableLayoutPanel {Dock=DockStyle.Fill,Padding=new Padding(16),ColumnCount=1,RowCount=7};
        var father=new LinkLabel {Text="Создать бота в @BotFather",AutoSize=true};
        father.LinkClicked+=(s,e)=>OpenLink("https://t.me/BotFather");
        bot.LinkClicked+=(s,e)=>OpenLink(botUrl);
        layout.Controls.Add(father);
        layout.Controls.Add(new Label {Text="Токен бота",AutoSize=true});
        layout.Controls.Add(token);layout.Controls.Add(bot);
        layout.Controls.Add(message);layout.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,23));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,30));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var cancel=new Button { Text="Закрыть",AutoSize=true,DialogResult=DialogResult.Cancel };
        var buttons=new FlowLayoutPanel { Dock=DockStyle.Fill };
        buttons.Controls.Add(next);buttons.Controls.Add(cancel);layout.Controls.Add(buttons);
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));Controls.Add(layout);CancelButton=cancel;
        token.TextChanged+=(s,e)=>{code=null;bot.Visible=false;next.Text="Проверить токен";message.Text="";};
        next.Click+=async (s,e)=>await Connect();
        message.Text="В BotFather выберите /newbot и вставьте выданный токен.";
    }
    void OpenLink(string address) {
        try { Process.Start(new ProcessStartInfo(address){UseShellExecute=true}); }
        catch { message.Text="Откройте ссылку вручную: "+address; }
    }
    async Task Connect() {
        bool begin=code==null;
        string request=new JavaScriptSerializer().Serialize(new {token=token.Text.Trim(),code=code});
        next.Enabled=token.Enabled=false;message.Text="Проверяю подключение…";
        try {
            var result=await Task.Run(()=>MonitorPanel.Bridge(begin?"telegram-begin":"telegram-finish",request));
            if(IsDisposed)return;
            string username=(string)result["username"];
            if(begin){
                code=(string)result["code"];
                botUrl="https://t.me/"+username+"?start="+code;
                bot.Text="Открыть @"+username+" в Telegram";bot.Visible=true;
                message.Text=(bool)result["connected"]?"Эта установка уже привязана к чату. Откройте бота, нажмите «Запустить» и подтвердите отправку в сохранённый чат.":"Перейдите по ссылке выше, нажмите «Запустить» в Telegram, затем подтвердите подключение здесь.";
                next.Text="Подключить и отправить проверку";
            } else {
                MessageBox.Show(this,"Бот @"+username+" подключён. Проверочное сообщение отправлено.","Telegram");
                DialogResult=DialogResult.OK;
            }
        } catch(Exception ex){if(!IsDisposed)message.Text=ex.Message;}
        finally{if(!IsDisposed){next.Enabled=token.Enabled=true;}}
    }
}
